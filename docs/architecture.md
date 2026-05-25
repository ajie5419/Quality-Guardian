# Quality Guardian 后端架构重构方案

## 一、当前架构诊断

### 1.1 数据概览

| 指标            | 数量 | 说明                             |
| --------------- | ---- | -------------------------------- |
| API 路由文件    | 269  | 入口多，每个都重复 try/catch     |
| Service 文件    | 32   | 业务逻辑集中，单文件最大 2236 行 |
| Utils 文件      | 62   | 实际承担了"第二服务层"的角色     |
| Schema 校验文件 | 1    | 几乎没有入参校验                 |
| Middleware      | 2    | 没有统一错误处理                 |

### 1.2 核心问题

1. **Service 膨胀** — inspection.service.ts 2236 行，混合了查询构建、业务规则、数据转换、文件操作
2. **Utils 承担业务逻辑** — master-data-governance-kernel.ts (1241行)、registry.ts (1336行) 放在 utils 里
3. **无入参校验** — 269 个路由，绝大多数直接 `getQuery(event) as Record<string, unknown>`
4. **无统一错误处理** — 每个路由文件重复 try/catch 模板
5. **横切关注点散落** — 数据权限、审计日志、主数据治理在每个 service 里手动调用

---

## 二、QMS 业务特征分析

QMS 不是普通 CRUD 系统，它有以下特有复杂度：

| 特征 | 表现 | 当前实现方式 |
| --- | --- | --- |
| 跨域联动 | 检验→工单→供应商评分→监督计划 | service 互相 import（inspection 引用 7 个其他 service） |
| 数据权限 | 不同部门只能看自己的数据 | DataScopeService 在每个查询里手动调用 |
| 审计追溯 | 每次变更可追溯 | SystemLogService.recordAuditLog() 手动调用 |
| 状态机驱动 | 每个域都有状态流转 | if/else 散落在 service 中 |
| 主数据治理 | 写入必须引用规范化的主数据 | MasterDataGovernanceKernel 手动调用 |

---

## 三、目标架构

### 3.1 目录结构

```
server/
├── api/                          # 路由层（保持 Nitro 文件路由）
│   └── qms/
│       ├── inspection/
│       ├── work-order/
│       └── ...
│
├── modules/                      # 业务模块（替代扁平 services/）
│   ├── inspection/
│   │   ├── inspection.definition.ts   # 模块声明
│   │   ├── inspection.service.ts      # 特殊业务逻辑
│   │   ├── inspection.commands.ts     # 写操作
│   │   ├── inspection.queries.ts      # 读操作
│   │   └── inspection.repo.ts         # 自定义查询（可选）
│   ├── work-order/
│   ├── supplier/
│   ├── supervision/
│   ├── after-sales/
│   ├── metrology/
│   ├── quality-loss/
│   └── ...
│
├── core/                         # QMS 横切能力引擎
│   ├── module-registry/          # 模块注册与通用 CRUD 生成
│   │   ├── types.ts
│   │   ├── define-module.ts
│   │   └── create-module-service.ts
│   ├── data-scope/               # 数据权限引擎
│   │   ├── data-scope.engine.ts
│   │   └── strategies/
│   ├── audit/                    # 审计日志引擎
│   │   └── audit.interceptor.ts
│   ├── workflow/                  # 状态机引擎
│   │   ├── state-machine.ts
│   │   └── definitions/
│   └── master-data/              # 主数据治理引擎（从 utils 移入）
│       ├── governance-kernel.ts
│       ├── governance-registry.ts
│       └── governance-write.ts
│
├── schemas/                      # Zod 入参校验（按模块组织）
├── middleware/                   # 统一错误处理、请求去重
├── prisma/
└── config/
```

### 3.2 核心设计：Module Definition（模块即契约）

每个 QMS 模块通过 `defineModule()` 声明配置，框架自动接入通用能力：

```typescript
// core/module-registry/types.ts
interface QmsModuleDefinition<TModel, TCreateInput, TUpdateInput> {
  name: string;
  prismaDelegate: PrismaDelegate<TModel>;

  dataScope: {
    strategy: 'dept' | 'team' | 'personal' | 'none';
    deptField?: string;
    teamField?: string;
  };

  audit: {
    enabled: boolean;
    trackedFields?: (keyof TModel)[];
  };

  workflow?: StateMachineDefinition;

  governedFields?: Array<{
    field: keyof TCreateInput;
    masterTable: string;
  }>;

  softDelete: boolean;

  schemas: {
    create: ZodSchema<TCreateInput>;
    update: ZodSchema<TUpdateInput>;
    list: ZodSchema<any>;
  };
}
```

### 3.3 新增模块示例

以"不合格品处置"模块为例，展示完整的模块定义：

```typescript
// modules/nonconformance/nonconformance.definition.ts
import { z } from 'zod';
import { defineModule } from '~/core/module-registry';

export const nonconformanceModule = defineModule({
  name: 'nonconformance',
  prismaDelegate: prisma.nonconformance_records,

  dataScope: {
    strategy: 'dept',
    deptField: 'responsibleDeptId',
  },

  audit: {
    enabled: true,
    trackedFields: ['status', 'disposition', 'assignee'],
  },

  workflow: {
    initial: 'OPEN',
    states: {
      OPEN: { on: { ASSIGN: 'ASSIGNED' } },
      ASSIGNED: { on: { ANALYZE: 'ANALYZING', CLOSE: 'CLOSED' } },
      ANALYZING: { on: { DISPOSE: 'DISPOSED', ESCALATE: 'ESCALATED' } },
      DISPOSED: { on: { VERIFY: 'VERIFIED', REOPEN: 'OPEN' } },
      ESCALATED: { on: { DISPOSE: 'DISPOSED' } },
      VERIFIED: { on: { CLOSE: 'CLOSED' } },
      CLOSED: { terminal: true },
    },
  },

  governedFields: [
    { field: 'processName', masterTable: 'master_processes' },
    { field: 'materialName', masterTable: 'master_materials' },
  ],

  softDelete: true,

  schemas: {
    create: z.object({
      title: z.string().min(1),
      processName: z.string(),
      materialName: z.string().optional(),
      severity: z.enum(['CRITICAL', 'MAJOR', 'MINOR']),
      description: z.string(),
    }),
    update: z.object({
      title: z.string().min(1).optional(),
      disposition: z.string().optional(),
      assignee: z.string().optional(),
    }),
    list: z.object({
      page: z.coerce.number().default(1),
      pageSize: z.coerce.number().default(20),
      status: z.string().optional(),
      severity: z.string().optional(),
      keyword: z.string().optional(),
    }),
  },
});
```

### 3.4 框架自动提供的能力

基于 definition，`createModuleService()` 自动生成标准 CRUD：

```typescript
// core/module-registry/create-module-service.ts
export function createModuleService(def: QmsModuleDefinition) {
  return {
    async list(params, ctx) {
      let where = buildWhereFromParams(params, def);
      if (def.dataScope.strategy !== 'none') {
        where = await dataScopeEngine.apply(def.dataScope, where, ctx);
      }
      if (def.softDelete) where.isDeleted = false;
      return paginate(def.prismaDelegate, where, params);
    },

    async create(payload, ctx) {
      const data = def.schemas.create.parse(payload);
      if (def.governedFields) {
        await governanceKernel.resolveFields(data, def.governedFields);
      }
      if (def.workflow) data.status = def.workflow.initial;
      const record = await def.prismaDelegate.create({ data });
      if (def.audit.enabled) {
        await auditEngine.recordCreate(def.name, record, ctx);
      }
      return record;
    },

    async transition(id, action, ctx) {
      if (!def.workflow) throw new Error(`${def.name} has no workflow`);
      const record = await def.prismaDelegate.findUnique({ where: { id } });
      const nextState = workflowEngine.transition(
        def.workflow,
        record.status,
        action,
      );
      await def.prismaDelegate.update({
        where: { id },
        data: { status: nextState },
      });
      if (def.audit.enabled) {
        await auditEngine.recordTransition(
          def.name,
          id,
          record.status,
          nextState,
          ctx,
        );
      }
      return { ...record, status: nextState };
    },
    // update, delete, getById 同理...
  };
}
```

### 3.5 特殊逻辑通过 override 扩展

标准 CRUD 不够时，service 可以覆盖或扩展：

```typescript
// modules/inspection/inspection.service.ts
import { createModuleService } from '~/core/module-registry';
import { inspectionModule } from './inspection.definition';

const baseService = createModuleService(inspectionModule);

export const InspectionService = {
  ...baseService,

  // 覆盖：创建后自动绑定检验模板
  async create(payload, ctx) {
    const record = await baseService.create(payload, ctx);
    if (inspectionTemplateAutoBindEnabled) {
      await bindInspectionTemplate(record);
    }
    return record;
  },

  // 扩展：独有的统计查询
  async getPassRateStats(params, ctx) {
    // 特殊聚合逻辑，不走通用 CRUD
  },
};
```

### 3.6 新增模块 checklist

| 步骤 | 文件                            | 说明                   |
| ---- | ------------------------------- | ---------------------- |
| 1    | `modules/xxx/xxx.definition.ts` | 声明模块配置（必填）   |
| 2    | `prisma/migrations/`            | 建表                   |
| 3    | `api/qms/xxx/*.ts`              | 路由文件，每个 3-5 行  |
| 4    | `modules/xxx/xxx.service.ts`    | 仅在有特殊逻辑时才需要 |

不需要手动处理：分页、数据权限、审计日志、状态机、主数据治理、入参校验、软删除。

---

## 四、AI 协作约束策略

### 4.1 问题

AI 辅助开发时，每次对话是独立的上下文。AI 可能：

- 忘记模块必须用 `defineModule()` 声明
- 在 service 里直接 import prisma
- 忘记接入数据权限或审计日志
- 用自己的方式重新设计，不遵循已有模式

### 4.2 四层防线

```
第 4 层：代码生成器     → AI 不需要记忆，直接填空
第 3 层：治理脚本/CI    → 写错了也能被拦住
第 2 层：TypeScript 类型 → 编译期就报错
第 1 层：CLAUDE.md      → 兜底提示，减少试错次数
```

核心原则：**不依赖 AI 的"记忆力"，依赖代码的"强制力"。**

### 4.3 第 1 层：CLAUDE.md / AGENTS.md（提示层）

```markdown
# 后端模块开发规范

## 新增模块必须：

1. 在 modules/xxx/ 下创建 xxx.definition.ts
2. 使用 defineModule() 声明模块配置
3. 禁止在 service 中直接 import prisma
4. 禁止手动调用 SystemLogService — 审计通过 definition.audit 声明
5. 禁止手动调用 DataScopeService — 数据权限通过 definition.dataScope 声明
6. 路由文件禁止写 try/catch — 统一由 middleware 处理
7. 所有入参必须经过 Zod schema 校验

## 禁止：

- 在 utils/ 中放业务逻辑
- service 文件超过 500 行
- 不经过 schema 校验直接使用 getQuery()
```

局限：AI 可能不看，或认为"这次情况特殊"而绕过。

### 4.4 第 2 层：TypeScript 类型约束（编译期强制）

```typescript
// core/module-registry/types.ts

// dataScope、audit、schemas 全部是必填字段
// AI 不填 → TypeScript 编译报错 → 必须修复
interface QmsModuleDefinition<T> {
  name: string;
  prismaDelegate: PrismaDelegate<T>;
  dataScope: DataScopeConfig; // 必填
  audit: AuditConfig; // 必填
  schemas: {
    // 必填
    create: ZodSchema;
    update: ZodSchema;
    list: ZodSchema;
  };
  softDelete: boolean; // 必须显式声明
  workflow?: StateMachineDefinition;
  governedFields?: GovernedField[];
}

// 路由层 helper — 强制要求 schema
export function defineValidatedHandler<T extends ZodSchema>(
  schema: T,
  handler: (event: H3Event, input: z.infer<T>) => Promise<any>,
) {
  return defineEventHandler(async (event) => {
    const input = schema.parse(getQuery(event));
    return handler(event, input);
  });
}
// AI 如果不用这个 helper，直接 getQuery() 得到的是 unknown 类型
// 后续代码全部报错，逼迫它回到正确路径
```

效果：AI 想违反约束时，IDE 和编译器会立即报错。

### 4.5 第 3 层：治理脚本 / CI 拦截（运行时强制）

```typescript
// tooling/governance/rules/module-structure.ts
export default defineRule({
  name: 'module-structure',
  description: '每个业务模块必须有 definition 文件',
  async check() {
    const modules = glob('apps/server/modules/*/');
    const violations = [];
    for (const mod of modules) {
      if (!exists(`${mod}/*.definition.ts`)) {
        violations.push(`${mod} 缺少 .definition.ts`);
      }
    }
    return { pass: violations.length === 0, violations };
  },
});

// tooling/governance/rules/no-raw-prisma-in-service.ts
export default defineRule({
  name: 'no-raw-prisma-in-service',
  description: 'Service 禁止直接 import prisma',
  async check() {
    const serviceFiles = glob('apps/server/modules/**/*.service.ts');
    const violations = serviceFiles.filter((f) =>
      content(f).includes("from '~/utils/prisma'"),
    );
    return { pass: violations.length === 0, violations };
  },
});

// tooling/governance/rules/no-manual-audit.ts
export default defineRule({
  name: 'no-manual-audit',
  description: '禁止手动调用 SystemLogService，审计通过 definition 声明',
  async check() {
    const moduleFiles = glob('apps/server/modules/**/*.ts');
    const violations = moduleFiles.filter(
      (f) =>
        !f.includes('core/audit') &&
        content(f).includes('SystemLogService.recordAuditLog'),
    );
    return { pass: violations.length === 0, violations };
  },
});
```

效果：AI 写完代码 → CI 跑治理脚本 → 不合规直接挂掉 → AI 看到报错自动修正。

### 4.6 第 4 层：代码生成器（最强防线）

AI 不需要"记住"模式，给它一个脚手架命令：

```bash
pnpm generate:module nonconformance
```

自动生成完整骨架：

```
modules/nonconformance/
├── nonconformance.definition.ts   # 模板，填 TODO 即可
├── nonconformance.service.ts      # 基于 createModuleService 的骨架
└── __tests__/
    └── nonconformance.test.ts     # 基础 CRUD 测试
api/qms/nonconformance/
├── index.get.ts                   # 列表
├── index.post.ts                  # 创建
├── [id].get.ts                    # 详情
├── [id].put.ts                    # 更新
└── [id].delete.ts                 # 删除
```

生成的 definition 文件用 TODO 标记必填项，AI 只需要填空：

```typescript
// ⚠️ AUTO-GENERATED — 填写 TODO 部分即可
export const nonconformanceModule = defineModule({
  name: 'nonconformance',
  prismaDelegate: prisma.xxx, // TODO: 确认表名
  dataScope: {
    strategy: 'dept', // TODO: 选择策略
    deptField: 'deptId', // TODO: 确认字段
  },
  audit: {
    enabled: true, // TODO: 是否需要审计
    trackedFields: [], // TODO: 追踪哪些字段
  },
  workflow: undefined, // TODO: 状态机定义
  governedFields: [], // TODO: 主数据引用
  softDelete: true,
  schemas: {
    create: z.object({
      /* TODO */
    }),
    update: z.object({
      /* TODO */
    }),
    list: z.object({
      page: z.coerce.number().default(1),
      pageSize: z.coerce.number().default(20),
      // TODO: 过滤条件
    }),
  },
});
```

效果：AI 的工作从"设计一个模块"变成"填 TODO"。dataScope 是必填字段，不填编译不过。

### 4.7 各层防线的对比

| 防线 | 拦截时机 | 能防住什么 | 局限 |
| --- | --- | --- | --- |
| CLAUDE.md | AI 开始写代码前 | 减少试错，给 AI 正确方向 | AI 可能忽略 |
| TypeScript 类型 | 编译期 | 漏填必填字段、绕过 schema | 无法阻止"逻辑上合规但设计上错误"的代码 |
| 治理脚本 | CI / pre-commit | 直接 import prisma、手动调审计 | 需要维护规则 |
| 代码生成器 | 写代码前 | 根本不给 AI 从零设计的机会 | 无法覆盖非标准场景 |

---

## 五、迁移路径

### 5.1 阶段划分

| 阶段 | 内容 | 工作量 | 风险 |
| --- | --- | --- | --- |
| Phase 0 | 搭建 core/ 骨架 + defineModule 类型系统 | 1 周 | 低（纯新增） |
| Phase 1 | 加统一错误处理 middleware，路由层逐步删 try/catch | 1 周 | 低（纯减代码） |
| Phase 2 | 迁移 1 个模块作为样板（建议 supplier，复杂度适中） | 1 周 | 低（新旧并存） |
| Phase 3 | 加治理脚本 + 代码生成器 | 1 周 | 低（纯工具） |
| Phase 4 | 逐步迁移其余模块（新代码必须用新模式） | 持续 | 低（渐进式） |

### 5.2 迁移原则

1. **新旧并存** — 不要求一次性迁移完，老 service 继续工作
2. **新代码必须用新模式** — 通过治理脚本强制
3. **老代码按需迁** — 有大改需求时顺手迁移，不单独排迁移任务
4. **样板先行** — 先迁移一个模块作为参考，其他模块照着来

---

## 六、前端架构策略

### 6.1 现状评估

| 指标                          | 数据                                       |
| ----------------------------- | ------------------------------------------ |
| 前端总文件                    | 326 个                                     |
| API 文件                      | 24 个，共 3071 行                          |
| 最大 API 文件                 | planning.ts (404行)、work-order.ts (297行) |
| views 中有 composables 的模块 | 15 个                                      |
| 全局 store                    | 仅 2 个文件（index.ts, auth.ts）           |
| Vben 渗透文件                 | 171 个（占 52%）                           |

### 6.2 结论：不做大重构，制定新代码规范

前端深度绑定 Vben Admin（i18n 115 文件、VxeGrid 35 文件、Form 20 文件），去 Vben 化 ≈ 重写前端（3-4 个月），用户感知为零。

策略：**冻结框架层，规范业务层，新模块用标准模式。**

### 6.3 前端模块标准结构

当前 `views/qms/inspection/records/` 的结构已经是较好的实践，将其标准化：

```
views/qms/{module}/
├── index.vue                      # 页面入口
├── config.ts                      # 表格列定义、表单 schema
├── config.test.ts                 # config 的单测
├── composables/
│   └── use{Module}.ts             # 该模块的核心逻辑 composable
└── components/
    ├── {Module}Form.vue           # 表单组件
    ├── {Module}Grid.vue           # 表格组件（如果不用 VxeGrid）
    └── form/                      # 表单内的子组件
        └── XxxSelect.vue
```

规则：

- 每个模块的 composable 封装所有数据获取和状态管理逻辑
- index.vue 只做组合和布局，不写业务逻辑
- config.ts 集中管理列定义和表单 schema，方便维护和测试

### 6.4 API 层规范

当前问题：单个 API 文件过大（planning.ts 404 行），且所有模块的 API 集中在 `api/qms/` 下。

规范：

```
api/qms/
├── inspection/
│   ├── records.ts                 # 检验记录相关 API
│   ├── requests.ts                # 检验请求相关 API
│   └── issues.ts                  # 检验问题相关 API
├── work-order/
│   ├── index.ts                   # 工单 CRUD
│   └── requirements.ts            # 工单需求
└── ...
```

规则：

- 单个 API 文件不超过 200 行，超过则按子资源拆分
- 每个 API 函数必须有返回类型标注（从 `@qgs/shared` 导入）
- 统一使用 `useRequest` 封装，禁止裸写 axios/fetch

```typescript
// api/qms/inspection/records.ts
import type {
  InspectionRecord,
  InspectionRecordListQuery,
} from '@qgs/shared/inspection';
import { useRequest } from '~/utils/request';

export function getInspectionRecords(params: InspectionRecordListQuery) {
  return useRequest.get<PaginatedResult<InspectionRecord>>(
    '/api/qms/inspection/records',
    { params },
  );
}
```

### 6.5 前端与后端 Module Definition 的联动

后端每个模块有 `definition.ts`，前端对应模块也应有一个 `config.ts` 作为"前端模块声明"：

```typescript
// views/qms/nonconformance/config.ts
import type { VxeGridProps } from 'vxe-table';
import type { VbenFormSchema } from '@vben/common-ui';
import {
  NonconformanceSeverity,
  NonconformanceStatus,
} from '@qgs/shared/nonconformance';

export const gridColumns: VxeGridProps['columns'] = [
  { field: 'title', title: '标题', minWidth: 200 },
  {
    field: 'severity',
    title: '严重程度',
    width: 100,
    formatter: ({ cellValue }) => NonconformanceSeverity.label(cellValue),
  },
  { field: 'status', title: '状态', width: 120, slots: { default: 'status' } },
  { field: 'createdAt', title: '创建时间', width: 160 },
];

export const formSchemas: VbenFormSchema[] = [
  { field: 'title', label: '标题', component: 'Input', required: true },
  {
    field: 'severity',
    label: '严重程度',
    component: 'Select',
    componentProps: { options: NonconformanceSeverity.options() },
  },
  {
    field: 'processName',
    label: '工序',
    component: 'MasterDataSelect',
    componentProps: { masterTable: 'master_processes' },
  },
];

export const workflowActions = NonconformanceStatus.availableActions;
```

规则：

- 枚举、类型从 `@qgs/shared` 导入，前后端共享一份定义
- 表格列和表单 schema 集中在 config.ts，不散落在 template 里
- 主数据选择器统一用 `MasterDataSelect` 组件，自动走治理流程

### 6.6 前端不做的事

| 不做                     | 理由                                       |
| ------------------------ | ------------------------------------------ |
| 去 Vben 化               | 3-4 个月工作量，用户感知为零               |
| 全局 feature-sliced 迁移 | 现有结构够用，迁移成本高                   |
| 替换 VxeGrid / VbenForm  | 声明式配置要全部重写                       |
| 替换 i18n 方案           | 115 个文件，纯机械劳动                     |
| 引入新状态管理方案       | 当前只有 2 个 store 文件，没有状态管理问题 |

### 6.7 前端要做的事

| 要做 | 收益 |
| --- | --- |
| API 文件按子资源拆分（超过 200 行时） | 可维护性 |
| 新模块统一用标准结构（config.ts + composable + components） | 一致性 |
| 从 `@qgs/shared` 导入类型和枚举 | 前后端类型一致 |
| 通用业务组件沉淀到 `components/Qms/` | 复用性 |
| config.ts 加单测 | 列定义和表单 schema 是高频改动点 |

---

## 七、总结

### 投入产出比

| 方向 | 工作量 | 收益 | 优先级 |
| --- | --- | --- | --- |
| 后端 Module Definition 体系 | 4 周搭建 + 持续迁移 | 新模块开发效率翻倍，质量一致性保证 | P0 |
| AI 约束四层防线 | 2 周 | 消除 AI 协作中的规范遗忘问题 | P0 |
| Domain 包合并 | 2 周 | 消除前后端共享代码的认知负担 | P1 |
| 前端规范化（不重构） | 1 周制定 + 持续执行 | 新模块代码质量一致 | P2 |
| 治理脚本引擎化 | 1 周 | 规则可维护、可扩展 | P2 |
