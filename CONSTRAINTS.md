# CONSTRAINTS.md — 硬约束

本文件记录不可违反的技术约束。违反任一条即阻断合并。

## 禁止

1. **禁止**使用 npm 或 yarn，只用 pnpm
2. **禁止**手动修改数据库表结构，必须通过 Prisma migration
3. **禁止**在代码中硬编码密钥、token、数据库连接串
4. **禁止**在 `utils/` 中放业务逻辑，业务逻辑属于 `modules/`
5. **禁止**模块之间 import 对方的内部文件（只能通过 `index.ts` 导出）
6. **禁止**在路由文件中直接写业务逻辑，必须调用 service
7. **禁止**跳过认证（每个非 public 端点必须 `verifyAccessToken`）
8. **禁止**返回非标准响应格式（必须用 `useResponseSuccess` 系列）
9. **禁止**在 migration 文件中写业务数据操作
10. **禁止**提交未通过 `pnpm lint && pnpm run check:type` 的代码

## 必须

1. **必须**在提交前通过：`pnpm lint && pnpm run check:type && pnpm run check:qms-arch`
2. **必须**对所有用户输入做校验（zod schema）
3. **必须**对数据库查询加 `isDeleted: false` 过滤（软删除）
4. **必须**在 catch 块中调用 `logApiError` 记录错误
5. **必须**新增业务逻辑时附带单元测试
6. **必须**使用 cuid 作为主键生成策略（禁止 Date.now()）
7. **必须**分页接口限制 pageSize 上限（max 100）
8. **必须**原始 SQL 使用参数化查询，防止注入

## 完成定义

功能完成 = 端到端验证通过，不是"代码写完了"。

验证层级（严格顺序，上层未通过禁止进入下层）：

1. **单元测试通过** — `pnpm --dir apps/backend exec vitest run`
2. **集成测试通过** — 相关模块联合验证
3. **端到端流程验证通过** — 完整业务路径走通

## 路由层规范

1. **路由文件不超过 50 行** — 超过说明业务逻辑该提到 modules/
2. **路由文件禁止直接 import prisma** — 通过 modules/ 下的 service 访问数据
3. **readBody 必须过 zod schema 校验** — 禁止 `as Record<string, unknown>` 或 `as any`

## Service 层规范

1. **单个 service 文件不超过 500 行** — 超过必须按职责拆分
2. **单个方法不超过 50 行** — 超过必须提取子函数
3. **禁止跨模块直接查表** — 需要其他模块的数据时调对方 service
4. **禁止 `(prisma.xxx as any)` 类型绕过** — 表必须在 schema 中声明
5. **禁止 `execSync`** — 所有外部命令必须异步执行
6. **禁止 `Date.now()` 生成 ID** — 统一使用 cuid
7. **禁止全量加载到内存再分页** — 分页在 DB 层（skip + take），聚合用 groupBy/aggregate
8. **禁止在 service 中嵌入文件解析逻辑** — Excel/CSV 解析提取到 utils/excel-parser.ts

## 类型安全规范

1. **禁止 `as any`** — 全项目范围（api/ + modules/ + utils/），测试文件除外
2. **禁止非空断言 `!`** — 用条件判断或 early return 代替，测试文件除外
3. **禁止 `as unknown as T` 双重断言** — 说明类型设计有问题，需修正类型定义
4. **允许 `as const`** — 安全的类型收窄
5. **允许测试文件中的 `as any`** — mock 场景需要

## 模块边界规范

1. **每个模块只操作自己拥有的表** — 表归属见 prisma/schema.prisma
2. **跨模块数据访问必须通过 service 接口** — A 需要 B 的数据 → 调 B.service
3. **共享逻辑放 utils/ 或提取为新模块** — 禁止复制粘贴
4. **横切关注点（审计、数据权限、ID 解析）由框架层统一处理** — service 不手动调用

## 字段与数据规范

1. **禁止**硬编码业务数据值（工序名、供应商名、字典项等）
2. **禁止**多处重复定义字段名/列名，`prisma/schema.prisma` 为唯一真源
3. **禁止**用字符串字面量做业务分支判断，必须用枚举常量
4. **禁止** `$queryRawUnsafe` 与模板字符串组合（SQL 注入风险）
5. **必须**新增主数据类型时提供管理接口（CRUD）
6. **必须**引用主数据时存 ID（外键），不能只存 name
7. **必须**使用 `createModuleLogger` 记录日志，禁止 console.log/warn/error

## 架构守护（自动化检测）

`pnpm run check:qms-arch` 在提交前自动执行，检测以下规则：

**目录结构：**

- 不得存在 services/、core/module-registry/、core/master-data/ 目录
- utils/ 只允许白名单内的基础设施文件

**路由层：**

- api/ 文件不得 import prisma
- api/ 文件不超过 50 行
- api/ 文件不得出现 `as Record<string, unknown>` 或 `as any`

**Service 层：**

- modules/ 单文件不超过 500 行
- 不得出现 `(prisma.xxx as any)`
- 不得出现 `execSync`
- 不得出现 `Date.now()` 用于 ID 生成
- 不得出现 console.log、console.warn、console.error

**类型安全：**

- 不得出现 `as any`（排除 `__tests__/` 和 `*.test.ts`）
- 不得出现非空断言 `!`（排除 `__tests__/` 和 `*.test.ts`）
- 不得出现 `as unknown as T` 双重断言

**模块边界：**

- modules/A/ 不得 import modules/B/ 的非 index.ts 文件
- 不得出现中文字符串字面量做条件判断

**安全：**

- 不得出现 `$queryRawUnsafe` + 模板字符串组合

违反任一条即阻断提交。

## 执行流程规范（防止灾难性偏离）

执行多步骤任务（如重构方案的某个阶段）时必须遵守：

### 强制 commit 节奏

1. **每个 step 完成必须立即 commit** — 不 commit 不算"完成"
2. **不允许累积 step** — 不能"做完 step 1-3 一起 commit"，必须每步独立
3. **commit 失败必须立即修复或回滚** — 不允许带着失败的 commit 继续做下一步

### 自检命令（每个 step 完成后必跑）

```bash
# 1. 验证有新 commit
git log --oneline -3

# 2. 验证未提交文件数合理（应该 ≤ 20）
git status --short | wc -l

# 3. 验证模块文件数没有异常膨胀
find apps/backend/modules -name "*.ts" -not -path "*/node_modules/*" | wc -l

# 4. typecheck 通过
pnpm -C apps/backend exec tsc --noEmit

# 5. 测试通过
pnpm -C apps/backend exec vitest run
```

### 异常停止条件（出现立即停下，不要继续）

- 未提交文件数 > 30
- 模块文件数比上一阶段开始时多 50% 以上
- typecheck 报错超过 5 个
- 测试通过数下降超过 10 个

### 验证规则

- 报告"完成 step N"时，必须包含上述自检命令的输出
- 不允许只说"已完成"，必须给出新 commit 的 hash
- 不允许只说"测试通过"，必须给出通过的测试数

### 错误恢复

- 如果改坏了文件，**不要继续机械替换"修复"**
- 立即停下，报告"工作树损坏"
- 选项：
  1. 回滚到最近的 good commit（如果该 step 没 commit）
  2. 逐文件手修（如果已 commit 过半，回滚代价大）

## 新增模块规范

新增一个业务模块时，必须完成以下步骤：

### 目录结构（最小骨架）

```
modules/new-module/
├── index.ts                    # 对外导出（只导出 service 和类型）
├── new-module.service.ts       # 业务逻辑
├── new-module.module.ts        # 模块声明（menus、dataScope、audit、idResolution）
└── new-module.service.test.ts  # 单元测试
```

### 必须完成的注册

1. 在 `utils/module-loader.ts` 的 `MODULE_DECLARATIONS` 数组中注册
2. 在 `prisma/schema.prisma` 中新增表时，加注释标注归属模块：`// @module new-module`
3. 在 `api/` 下创建对应路由目录

### index.ts 导出规则

- 只导出 service 对象和公共类型
- 不导出内部工具函数、常量、prisma 实例
- 其他模块只能 `import from '~/modules/new-module'`（即 index.ts）

### 测试要求

- 测试文件放在模块目录内（`xxx.service.test.ts`）
- 不允许放在集中的 `__tests__/` 目录
- 不允许存在 `modules/__tests__/` 目录
