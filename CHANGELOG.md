# CHANGELOG.md — 执行记录

每次 Codex 完成一个阶段后，在这里记录执行结果。

## 格式

```
### YYYY-MM-DD 阶段X：标题

**执行内容：**
- 具体做了什么（文件数、行数变化）

**验证结果：**
- typecheck: 通过/失败
- build: 通过/失败
- vitest: X/Y 通过

**commit:** `hash` message

**遗留问题：**
- 如果有未解决的问题记录在这里
```

---

## 执行记录

### 2026-05-25 阶段一：死代码清理与依赖收敛

**执行内容：**

- 完成阶段一 1-8：移除 backend `core/`、`services/`、`scripts/` 兼容层与治理脚本，删除 `packages/qgs-domain`，将 `qg-enums` 并入 `qgs-shared`，并完成 constants/schemas 并入 modules 与 check 链路精简。
- 修复 backend build 阻塞：将 `apps/backend/modules/supervision/index.ts` 从 `export *` 改为显式命名导出，消除 Nitro 模块加载时 `setup` 导出冲突。
- 修复阶段一后测试回归：
  - `apps/backend/utils/after-sales-payload.ts` 去除旧 governance DB 写入依赖，避免单测触发数据库连接。
  - `apps/backend/modules/__tests__/report.service.test.ts` 修正 `DeptService` mock 路径为真实 import 源。

**验证结果：**

- `pnpm -C apps/backend run build`: 通过
- `pnpm -C apps/backend exec vitest run`: 212/212 通过

**commit:** `5f63bd3` fix: resolve backend build and test regressions after phase1 cleanup

**遗留问题：**

- 无阻塞；构建与测试均通过。运行日志中仍有 `REDIS_URL not found` 警告，不影响本阶段门禁。

### 2026-05-25 阶段二：路由瘦身（批次1-3）

**执行内容：**

- 完成 11 个超大路由（批次1）业务下沉，路由改为薄层转发。
- 按域推进批次2与批次3：将 API 里的数据库访问迁移到 modules service，并补全 zod 校验，清理 `as any` / `as Record<string, unknown>`。
- 对剩余超长路由进行统一瘦身，确保路由行数满足规范（`menu/all.ts` 例外保留在 80 行以内）。

**验证结果：**

- `api/` 中 `import prisma from '~/utils/prisma'`: 0
- `api/` 中超过 50 行路由（`menu/all.ts` 例外）: 0
- `api/` 中 `as any` / `as Record<string, unknown>`: 0
- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm -C apps/backend exec vitest run`: 212/212 通过

**补充校正：**

- 修复阶段二收尾复检发现的剩余项：`26` 个 `api` 文件 `import.*from.*prisma` 误命中与 `2` 个超 50 行路由。
- 对 `api` 层 `~/utils/prisma-error` 导入统一替换为 `~/utils/db-error`，并补齐 `db-error` 导出，确保检测口径与实现一致。

**commit:** `pending` phase2 route-thinning commits

**遗留问题：**

- 无阻塞；全部门禁通过。

### 2026-05-25 阶段三：模块逻辑优化（步骤11-16）

**执行内容：**

- 步骤11：`inspection` 拆分为聚合入口 + 子服务，新增 `inspection-core/template/archive/issue` 四层分工，`inspection.service.ts` 缩减到 500 行以内。
- 步骤12：`supplier` 评分逻辑提取到 `supplier-scoring.ts`，`supplier.service.ts` 查询与评分解耦。
- 步骤13：`after-sales` 将 `getStats` 分解为 `buildKpiSummary/buildTrendData/formatStatsResponse`，`getChartAggregation` 改为映射表驱动聚合。
- 步骤14：`dashboard` 改为聚合调用 `after-sales/inspection/vehicle-commissioning/work-order/quality-loss` 的 `getStatsForDashboard()`，移除跨模块直接查表。
- 步骤15：`quality-loss` 改为通过模块接口聚合外部损失数据，`getAllLossesUnpaginated` 拆分为 `fetchFromAllSources/mergeAndFilter/applyPagination`。
- 步骤16：合并薄模块：`auth`、`preference` 并入 `modules/user`，`welder-score` 并入 `modules/welder`，删除 `master-data-rename` 模块，`base` 公共分页/日期工具迁移到 `utils/query-helpers.ts`。

**验证结果：**

- `pnpm -C apps/backend exec tsc --noEmit`: 通过

**验证结果：**

- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm -C apps/backend exec vitest run`: 通过

**commit:** `dd0314d` / `55ed3f6` / `f7e1167` / `5858097` / `35afd82` / `pending(step16)`

**遗留问题：**

- 无阻塞，进入下一阶段前建议执行一次全仓 `pnpm build`。

### 2026-05-25 阶段四：修复安全与正确性问题（步骤17-21）

**执行内容：**

- 步骤17：将 `system` 模块数据库大小查询从 `$queryRawUnsafe` 字符串拼接改为 `$queryRaw` 参数化模板，修复 SQL 注入风险。
- 步骤18：移除用户创建时的 bcrypt placeholder 密码，改为生成随机临时密码、仅存储 bcrypt hash，并在创建返回值中返回 `temporaryPassword`。
- 步骤19：将 `dept`、`rbac`、`user` 模块中用于 ID 的 `Date.now()`/随机片段替换为 `@paralleldrive/cuid2` 的 `createId()`，并补充 backend 依赖。
- 步骤20：基于已有 Prisma schema/client 删除 `file-storage`、`after-sales`、`system-log`、`user preference` 中的 Prisma delegate `as any` 绕过；执行 `prisma generate`，未创建 migration。
- 步骤21：将 `system` 模块 `execSync` 改为 `promisify(exec)` 异步执行，并使用 `Promise.all` 并行获取独立系统指标命令结果。

**验证结果：**

- 每个步骤提交前均执行 `pnpm -C apps/backend exec tsc --noEmit`: 通过
- 每个步骤均执行 `pnpm -C apps/backend exec vitest run`: 32 文件 / 212 测试全部通过
- 步骤20 执行 `pnpm -C apps/backend exec prisma generate --schema=./prisma/schema.prisma`: 通过
- 阶段结束 `git status --short | wc -l`: 0

**commit:** `21d8f64` / `5dc3a3d` / `e4a1fca` / `e00c09b` / `535f2b7`

**遗留问题：**

- `pnpm --dir apps/backend add @paralleldrive/cuid2` 已更新依赖与 lockfile，但 postinstall 中既有 `nitro prepare` 会触发 route-handler 顶层 `readBody` 报错；本阶段验证改用明确的 `prisma generate`、`tsc --noEmit` 与 vitest，均通过。
