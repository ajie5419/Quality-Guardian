# 日常开发指引

本页提供定位、示例和日常反馈命令；规范仍以 [项目档案](PROJECT_GUIDE.md) 第 0、4、6、7 节及各领域契约为准。

## 先看本次需要哪些检查

```bash
pnpm run check:daily
```

默认只输出推荐命令，不执行检查、不改文件。默认读取 `origin/main...HEAD`、暂存、未暂存和未跟踪路径；可用 `pnpm run check:daily -- --base HEAD` 只看工作区，或指定已知分支基准。删除及改名两侧都参与分类，未知基准或配置/工具/共享包改动建议完整检查。Git 无法读取或显式基准无效时返回非零，不显示“通过”。

### 一键执行日常推荐检查 (--run / --exec)

若需自动按序运行上述日常推荐集合，可添加 `--run`（或 `--exec`）：

```bash
pnpm run check:daily -- --run
pnpm run check:daily -- --base HEAD --run
```

- **结构化结果**：依次输出每项执行命令、耗时与通过状态（`✓ PASS`、`⚡ SKIP (缓存)`、`✗ FAIL`）。
- **受限复用**：取消共享临时目录中的持久缓存。CLI 每次执行均重新检查，因为 Git 快照不能证明 `node_modules`、外部工具或运行环境未变；不会扫描依赖目录或读取环境凭据。`--no-cache` 仍可显式禁止复用。仅供同一进程内的调用方在保证依赖、工具、环境及外部输入固定时，向 `executeChecks` 传入同一个 `reuseContext` 对象进行复用；任一外部条件变化必须换新对象或使用 `useCache: false`，不能把它当作自动验证环境的指纹。
- **快照与秘密文件**：快照包含 checkout 的真实路径、HEAD、暂存状态和改动源码内容，未跟踪源码的新增、修改、删除均影响快照。只读取受限源码/文档后缀且名称不疑似秘密的普通文件；`.env`、私钥、凭据、未知格式、符号链接或读取失败均禁用复用，不读取其内容。被 Git 忽略的外部文件不在内容指纹内，不能宣称完整指纹。未知路径的元数据只用于变更提示。命令前后重新核对工作树，发现变化即返回失败、使旧结果失效并停止后续检查；这不是持续监控，也不能证明执行过程中发生后又还原的瞬时变化不存在。
- **边界与定位**：遇到任何失败立即中断并打印完整输出，不吞错误。此复用仅作为日常开发轻量反馈，**绝不替代或绕过** Lefthook hooks、提交门禁及 CI。
- **实际追加的测试**：认证/Token 路径改动追加存在于当前 checkout 的 `3.auth.test.ts`、`auth.service.test.ts`；DataScope/RBAC 改动追加 `data-scope.service.test.ts`、`scoped-repository.test.ts`、`rbac-authorize.service.test.ts`。默认仅推荐，只有显式执行模式才运行，且未运行的后续项不算通过。
- **报检-检验-NC 提示**：目前只追加关注关单 CAS、关联 NC、事务副作用的人工提示，并保留已存在的同名相邻测试推荐；不会自动追加上述全部事务测试，更不表示已覆盖或已运行。应按实际影响补选本页末尾列出的参考用例。

| 改动 | 日常最小反馈 |
| --- | --- |
| 纯说明文档 | diff、格式、链接、规则一致性；docs-drift |
| 后端业务 | 后端类型检查、改动文件 ESLint/Prettier、changed 架构、docs-drift、受影响测试 |
| Web 前端 | Web 类型检查、改动文件 ESLint/Prettier/Stylelint、changed 架构、docs-drift、受影响测试与桌面/移动端实测 |
| 小程序 | 改动文件 ESLint/Prettier/Stylelint、changed 架构、docs-drift、开发者工具实测；被跳过的 typecheck 不算证据 |
| 工具、配置、共享包或不确定范围 | 完整 lint/type/changed 架构/docs-drift，加受影响行为测试 |
| 数据库或指标 | 在对应集合上追加 migration 或 metric-governance，并按领域契约补验证 |

这是快速反馈分流，不是提交放行器。混合改动合并建议集合；相邻测试仅帮助定位，不证明全部影响面已覆盖。删除源码后应选择仍存在的消费者测试。Markdown 内嵌执行配置或脚本应按代码风险处理，不能只看扩展名。提交仍执行项目档案 §7 的必需集合，Commitlint、Zod、hook、CI 与发布门禁保持原样。

## 文档数字漂移如何修复

`check:daily` 默认只打印建议，不执行 docs-drift，也不会据此宣布文档已经漂移或已经通过。显式 `--run` 时只有实际执行到 docs-drift 且成功的结果才算该项通过。也可单独运行：

```bash
pnpm run check:docs-drift
```

若实际检查报 D1 版本、模块数或模块 TS 文件数漂移，依次执行：

```bash
pnpm run docs:sync
rtk git diff -- PROJECT_STATE.md
pnpm run check:docs-drift
```

同步只替换 `PROJECT_STATE.md` 中唯一且顺序正确的 `docs:sync-start/end` 硬数据块；块外的人工业务说明、待办和换行保持原样。文件或标记缺失、重复、倒置时同步失败且不写入；应先核对边界，不能扩大替换范围。提交前审阅同步 diff，而不是手动查数改数。

D2/D3 表示模块地图缺项、文件缺失或条目指向不存在的模块，需按 `code_map.md` 维护规则核对真实目录和职责后人工修改；`docs:sync` 不会替你编写或删除业务说明。缺模块 `ARCHITECTURE.md` 仍只提示，按模块实际职责补充，不提高或降低其阻断等级。

## 提交 scope 报错如何修复

Commitlint 的错误消息直接展示当前工作区实际包名和原有通用 scope，附有使用同一允许集合生成的英文提交示例。以当次消息列出的清单为准；包改名或移除后，提示随工作区变化，不把固定的应用名当作永远合法。

```bash
rtk git commit -m "chore(project): improve developer guidance"
```

`project` 是已有的通用 scope；省略 scope 仍按原规则允许。不要为了使用 `tooling` 等未登记 scope 增加白名单或关闭 Commitlint。类型、空主题和标题长度检查仍然阻断违规提交。

## 看懂门禁失败

```bash
pnpm run check:qms-arch -- --explain B-R1
```

失败输出先给 `[规则] 文件:行号 原始违规原因`，汇总后按失败规则给出中文原因、修复方法、范例和参考文档。原有历史基线仍只容纳已登记债务，不允许新增同类债务或超过原上限。修复代码后用原来的 `--changed` 或 `--all` 范围重跑；不要提高 baseline、补 allow marker 或关闭门禁来消除提示。

例如 B-R1 要把 Prisma 查询移到 Service，不是改 import 拼写；R-SCOPE 要沿用对象范围，认证成功或知道 ID 都不足以授权；R-SM 要把原状态放进事务内 CAS 条件并检查更新数量。子脚本运行异常与业务违规分别保留失败状态，不能当成零违规。

## 报检 → 检验完成 → 关联不合格项

参照 [检验模块契约](../apps/backend/modules/inspection/ARCHITECTURE.md)。这里的“关单”实际是一次检验完成操作：PASS 才进入 CLOSED；FAIL 创建/关联不合格项并保持 INSPECTING，等待处理或复检，不能把 FAIL 写成 CLOSED。

| 环节 | 当前入口与实现 | 新代码应复用的边界 |
| --- | --- | --- |
| 报检 | `apps/backend/api/qms/inspection/requests/v2.post.ts` → `inspection-request-create.post.service.ts` | CREATE 权限、V2 schema、canonical ID、登录创建幂等；V1 不再创建 |
| 完成检验 | `apps/backend/api/qms/inspection/requests/[id]/close.post.ts` → `inspection-request-close.post.service.ts` → `inspection-request-close.service.ts` | CLOSE 权限、输入校验、对象权限、DataScope、原状态 CAS |
| 生成/关联 NC | `inspection-request-close-issue.service.ts`、`inspection-request-close-linked-issue.service.ts` | 复用统一 issue 创建能力并传外层 tx；身份继承，NC 编号服务端分配 |
| 提交后副作用 | `inspection-request-close-effects.service.ts` | 附件快照 CAS 与有限重试；单项失败隔离，不回滚已经完成的主事务 |

表内未展开的文件均在 `apps/backend/modules/inspection/`。权限、事务、身份、幂等已经有实现，应使用这些入口扩展，避免再写一套简化的关闭业务。

### API 最小样板

GET 的认证、Zod、错误响应样板见 [API 规范](api-conventions.md)。现有 CLOSE 写端点如下；放到新域时替换成该域已经登记的权限和服务，不把 inspection 的权限当通用权限：

```typescript
import { INSPECTION_REQUEST_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import upstreamHandler from '~/modules/inspection/inspection-request-close.post.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, INSPECTION_REQUEST_PERMISSION_CODES.CLOSE);
  return upstreamHandler(event);
});
```

这一层仅适用于已有 upstream handler 的模块内路由适配；认证、Zod、对象范围、统一响应和错误日志仍由已核对的 handler/Service 完成，不能复制空 handler 后宣称安全。跨模块调用只能从目标 `index.ts` 导入公开能力；新增模块必须声明、注册并同步地图。

### Service 最小样板

先从已有 `inspection-request-responsibility-options.service.ts` 的公开方法开始：类型来自共享包，调用其他模块的公开服务，不直接查询其表。下面是现有实现的最小责任分支，可以直接用来理解或测试：

```typescript
import type { InspectionIssueResponsibilityType } from '@qgs/shared';

import { getInspectionRequestResponsibilitySupplierCategory } from '@qgs/shared';
import { DeptService } from '~/modules/dept';
import { SupplierService } from '~/modules/supplier';

export async function listResponsibilityOptions(options: {
  keyword?: string;
  responsibilityType: InspectionIssueResponsibilityType;
}) {
  const keyword = String(options.keyword || '').trim();
  const category = getInspectionRequestResponsibilitySupplierCategory(
    options.responsibilityType,
  );
  const [departments, suppliers] = await Promise.all([
    options.responsibilityType === 'OUTSOURCING_UNIT'
      ? Promise.resolve([])
      : DeptService.listActiveOptions(keyword),
    category
      ? SupplierService.listActiveOptions({ category, keyword })
      : Promise.resolve([]),
  ]);
  return {
    departments,
    responsibilityType: options.responsibilityType,
    suppliers,
  };
}
```

复杂写业务不要把这个只读样板当作关闭事务模板。关闭业务应沿用现有 `InspectionRequestCloseService.closeRequest`，特别保留以下结构：

```typescript
// Fragment inside the existing close transaction; not a standalone service.
const guard = await txRequestRepo.updateAccessible(
  {
    data: { status: INSPECTION_REQUEST_STATUS.INSPECTING },
    where: { id, isDeleted: false, status: request.status },
  },
  scopedAccess,
);
if (guard.count === 0)
  throw new BusinessError(ErrorCode.CONFLICT, '状态已变化，请刷新重试', 409);
// Create inspection records and linked issues with the same tx.
```

片段中的 `txRequestRepo` 来自当前事务的 `createScopedRepository`；`scopedAccess` 必须来自已有认证、数据权限与对象授权链路。片段不能独立复制上线：还需要合法状态检查、责任身份一致性、PASS/FAIL 分支、关联记录以及提交后副作用。不要默认构造 ALL 范围，也不要只做事务外“读取状态→写入”。

### 测试最小样板

文件与被测 Service 同目录。以下例子测试真实公开服务，mock 两个模块边界，验证外协分支不会读取内部部门：

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeptService } from '~/modules/dept';
import { SupplierService } from '~/modules/supplier';

import { InspectionRequestResponsibilityOptionsService } from './inspection-request-responsibility-options.service';

vi.mock('~/modules/dept', () => ({
  DeptService: { listActiveOptions: vi.fn() },
}));
vi.mock('~/modules/supplier', () => ({
  SupplierService: { listActiveOptions: vi.fn() },
}));

describe('responsibility options', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads external options without reading internal departments', async () => {
    vi.mocked(SupplierService.listActiveOptions).mockResolvedValue([]);
    const result = await InspectionRequestResponsibilityOptionsService.list({
      responsibilityType: 'OUTSOURCING_UNIT',
    });
    expect(DeptService.listActiveOptions).not.toHaveBeenCalled();
    expect(SupplierService.listActiveOptions).toHaveBeenCalledOnce();
    expect(result.departments).toEqual([]);
    expect(result.suppliers).toEqual([]);
  });
});
```

直接导入 `~/utils/prisma` 的测试必须在同文件 mock Prisma，模板见 [测试标准](testing.md)。定向检查从仓库根执行：

```bash
rtk vitest run apps/backend/modules/inspection/inspection-request-responsibility-options.service.test.ts
```

新增关闭逻辑至少覆盖：非法输入拒绝、无权限不写入、CAS 失配回滚且无副作用、PASS 关闭、FAIL 保持未关闭并关联 NC、身份冲突拒绝、外层 tx 传播、提交后单项副作用失败隔离。现成参考：

- `apps/backend/modules/inspection/inspection-request-close.service.test.ts`
- `apps/backend/modules/inspection/inspection-request-close-responsibility.service.test.ts`
- `apps/backend/modules/inspection/inspection-request-close-effects.service.test.ts`
- `apps/backend/modules/inspection/inspection-request-create.service.test.ts`

这些样板没有创建新业务端点、迁移数据或代替真实角色的端到端验收。
