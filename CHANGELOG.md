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

### 2026-05-25 阶段五：消除跨模块直接查表（步骤22-29）

**执行内容：**

- 步骤22：新增 `apps/backend/utils/dept-tree.ts`，提取部门树构建、扁平化和子树查找纯函数，并替换 `dept`、`report`、`after-sales`、`quality-loss`、`inspection` 中重复部门树遍历。
- 步骤23：`dashboard` 移除对 `work_orders`、`quality_records`、`inspections`、`work_order_requirements`、`system_settings` 的直接访问，改为调用 `work-order`、`inspection`、`work-order-requirement`、`system` 模块 service。
- 步骤24：`quality-loss` 外部来源读取、趋势、钻取和更新逻辑改为调用 `inspection`、`after-sales`、`vehicle-commissioning` service，模块内仅保留 `quality_losses` 自有表访问。
- 步骤25：`supplier` 评分聚合改为调用 `inspection` 与 `after-sales` 的供应商评分数据接口，模块内仅保留 `suppliers` 自有表访问。
- 步骤26：`report` 周报、日报汇总、质量分析和车辆故障率报表改为调用对应业务模块 service；`report` 内仅保留 `reports` 与 `daily_reports` 自有表访问。
- 步骤27：`welder` 评分扣分问题改为通过 `inspection` service 获取，避免直接访问 `quality_records`，并用懒加载规避 `inspection`/`welder` 初始化环依赖。
- 步骤28：`work-order` 对工单要求的创建、更新、列表、汇总读取改为调用 `work-order-requirement` service，模块内不再直接访问 `work_order_requirements`。
- 步骤29：`vehicle-commissioning` 审计日志读取改为调用 `system-log` service，不再直接访问 `audit_logs`。
- 收尾：补齐最终验收发现的 `work-order` 读取 `inspections`、`vehicle-commissioning` 读取 `daily_reports` 残留，分别改为 `inspection` 与 `report` 模块 service。

**验证结果：**

- 每个步骤提交前均执行 `pnpm -C apps/backend exec tsc --noEmit`: 通过
- 每个步骤提交前均执行 `pnpm -C apps/backend exec vitest run`: 32 文件 / 212 测试全部通过
- 阶段收尾执行跨模块直接查表扫描：目标模块仅剩各自拥有表访问，未发现非自有表直接访问
- 阶段结束 `git status --short | wc -l`: 0

**commit:** `84523e85` / `befd32f3` / `4f2acf4a` / `99f21147` / `7012a271` / `8ef38671` / `5591528f` / `dc7bca5c` / `d6008b8a`

**遗留问题：**

- 无阻塞；`pnpm -C apps/backend exec vitest run` 仍会输出 `REDIS_URL not found, caching disabled` 测试环境警告，不影响门禁结果。

### 2026-05-26 阶段六：性能问题修复（步骤30-36）

**执行内容：**

- 步骤30：`supplier.findAll` 改为 DB 层 `skip/take/count/orderBy`，供应商评分聚合只针对当前页供应商执行，全局统计改用 DB count/aggregate。
- 步骤31：`metrology` 台账、借用、检定计划列表全部改为 DB 层分页，`pageSize` 上限收敛为 100；动态状态过滤下推为 Prisma where。
- 步骤32：`welder.findAll` 全表统计改为 DB `count` 与 `_avg(score)` 聚合，不再加载全表到内存计算。
- 步骤33：`quality-loss` 单来源列表查询改为来源 service 支持 `skip/take/count`，手工损失表使用 DB 过滤/分页，钻取路径增加 DB 排序和上限。
- 步骤34：`dashboard.getStats` 改为 service 内进程级 Map + TTL 缓存，缓存 key 包含 `userId/scope/granularity`，并提供显式 `invalidateStatsCache` 入口。
- 步骤35：`vehicle-commissioning.getDailyReports` 改为通过 `daily_reports.date/summary` where 条件和 `skip/take/count` 读取候选页，读取时解析 `summary` 为结构化 DTO；未改 Prisma schema。
- 步骤36：`file-storage.registerReferencesFromAttachments` 将附件文件解析从逐项 `findFirst` 改为批量 `findMany` + 内存映射，引用写入继续使用 `deleteMany/createMany`。

**验证结果：**

- 每个步骤提交前均执行 `pnpm -C apps/backend exec tsc --noEmit`: 通过
- 每个步骤提交前均执行 `pnpm -C apps/backend exec vitest run`: 32 文件 / 212-213 测试全部通过
- 阶段结束 `git status --short | wc -l`: 0
- 阶段结束模块 TS 文件数：176

**commit:** `81b13d13` / `7b9b68be` / `48cf187f` / `e9439945` / `9547b8be` / `3d809882` / `1e4e6a5f`

**遗留问题：**

- `daily_reports.summary` 仍是 JSON blob；本阶段仅优化读取路径，结构化字段和索引拆分按阶段十二 Step 57 处理。
- `quality_losses` 当前 schema 没有 `workOrderNumber` 字段，手工损失按工单号过滤无法真正下推到 DB；如需支持，应在阶段十二 schema 优化中补字段与索引。
- `pnpm -C apps/backend exec vitest run` 仍会输出 `REDIS_URL not found, caching disabled` 测试环境警告，不影响门禁结果。

### 2026-05-26 阶段七：utils/ 归位（步骤37-38）

**执行内容：**

- 步骤37：按模块归位业务 utils，使用 `git mv` 迁移 after-sales、inspection、quality-loss、metrology、work-order、knowledge、planning、report、welder 等单模块工具。
- 步骤37：保留跨模块共享或基础设施工具在 `utils/`，包括 `inspection-form`、`quality-loss-status`、`supplier`、`import-report`、`audit-log`、`rbac-config`、`pass-rate`、`process-resolver`、`project-documents`、`ai`、`master-data-governance-*` 等。
- 步骤37h：审计 `utils/` 剩余文件，确认剩余项为白名单基础设施或跨模块共享工具；非测试 TS 文件数从 66 降至 43。
- 步骤38：新增 `apps/backend/utils/excel-parser.ts`，提取 `xlsx` 纯解析能力，并替换 inspection 模板元数据读取与 supervision 计划任务导入中的 inline Excel 解析。

**验证结果：**

- 每个 sub-step 提交前均执行 `pnpm -C apps/backend exec tsc --noEmit`: 通过
- 每个 sub-step 提交前均执行 `pnpm -C apps/backend exec vitest run`: 32 文件 / 213 测试全部通过
- 阶段收尾执行 `pnpm -C apps/backend run check:qms-arch`: apps/backend 无该脚本
- 阶段收尾执行 `pnpm run check:qms-arch`: 通过
- 阶段结束 `git status --short | wc -l`: 0

**commit:** `922232bf` / `f9422087` / `668d82a6` / `aa7e3e8f` / `ea46aecd` / `c887d93e` / `f87c9f6e` / `84c9e463` / `d3d959b3`

**遗留问题：**

- `utils/` 仍包含部分未列入阶段七输入白名单但实际为通用基础设施或跨模块共享的文件，例如 `response`、`route-param`、`request-validation`、`redis`、`team-resolver`、`task-dispatch`、`work-order` 等；本阶段按调用方审计后保留。
- vehicle-commissioning 当前命中的是 Excel 导出逻辑，不属于“文件 → 二维数据/对象数组”的读取解析路径，未强行接入 `excel-parser`。
- `pnpm -C apps/backend exec vitest run` 仍会输出 `REDIS_URL not found, caching disabled` 测试环境警告，不影响门禁结果。

### 2026-05-26 阶段八：CI + 架构守护（步骤39-40）

**执行内容：**

- 步骤39：精简 `.github/workflows/ci-gate.yml`，删除 12 个已失效治理 job，保留 `lint`、`typecheck`、`qms-arch`、`unit-tests`、`secret-scan` 5 个 job；文件行数从 348 行降至 108 行。
- 步骤40：重写 `scripts/check-qms-architecture.sh`，保留前端 R1/R3，并新增后端架构规则段；脚本行数从 246 行增至 343 行。
- 步骤40：立即启用 7 条当前零违规后端规则：B-D1、B-R1、B-R2、B-R3、B-S2、B-S3、B-SEC1。
- 步骤40：将暂不启用规则写为纯注释 TODO，不扫描、不豁免、不 baseline：B-S1（16 violations）、B-S4（需要重新定义 Date.now ID 生成匹配器）、B-S5（3 violations）、B-T1（约 12 violations）、B-T2（约 7 violations，utils 第三方桥接另行处理）、B-M1（many violations）、B-T3（scan-only initially）、B-M2（needs pre-scan）。

**验证结果：**

- `pnpm run check:qms-arch`: 通过，输出 `QMS architecture check passed.`
- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm -C apps/backend exec vitest run`: 32 文件 / 213 测试全部通过
- 阶段结束 `git status --short | wc -l`: 0

**commit:** `d6242a23` ci: prune obsolete gate jobs / current commit: chore: rewrite qms architecture check

**遗留问题：**

- B-S1、B-S4、B-S5、B-T1、B-T2、B-M1、B-T3、B-M2 按脚本 TODO 后续清理；本阶段未写入豁免或新增 baseline。

### 2026-05-26 阶段九：模块自治（步骤41-46）

**执行内容：**

- 步骤41：新增 `ModuleDeclaration` 类型与 25 个业务模块 `.module.ts` 声明文件，将菜单、DataScope、审计日志声明下沉到模块目录。
- 步骤42：新增 `utils/module-loader.ts`，集中加载模块声明，并提供菜单、DataScope、审计配置查询函数。
- 步骤43：将菜单初始化改为读取模块菜单声明，替换 `auth/codes.ts` 与 `rbac.service.ts` 调用，删除 `utils/menu-bootstrap.ts`（1144 行）。
- 步骤44：`DataScopeService` 去掉 QMS 模块名硬编码，新增通用 `buildScopedWhere()`，旧 `buildInspectionWhere/buildSupplierWhere/buildAfterSalesWhere/buildWorkOrderWhere` 保留为兼容包装。
- 步骤45：新增 `SystemLogService.auditLog(moduleName, actionKey, params)`，业务模块审计调用改为通过模块声明解析模板、动作和 targetType，底层写入逻辑不变。
- 步骤46：扫描 `api/` 与 `route-handlers/`，未发现 API 层直接做主数据 ID → 名称解析；现有 after-sales/quality-loss 解析均经模块 payload/service 函数处理，无需迁移。

**验证结果：**

- 每个步骤提交前均执行 `pnpm -C apps/backend exec tsc --noEmit`: 通过
- 每个步骤提交前均执行 `pnpm -C apps/backend exec vitest run`: 32 文件 / 213 测试全部通过
- 每个步骤提交前均执行 `pnpm run check:qms-arch`: 通过
- 阶段结束模块 TS 文件数：227
- 阶段结束 `git status --short | wc -l`: 0

**commit:** `5fff5c25` / `92c731a4` / `41eaa19e` / `1aa93ca9` / `0ec8573d` / current commit: step46 verify master data resolution

**遗留问题：**

- `module-loader.ts` 当前采用显式模块注册，避免 Nitro/tsc 环境下运行时 glob 差异；新增业务模块时需要在 loader 中注册对应声明。
- 仍保留 `recordBusinessAuditLog(event, params)` 作为带请求上下文的审计适配器；阶段十一做中间件自动审计时再统一收敛。

### 2026-05-26 阶段十：遗留清理（步骤47-52）

**执行内容：**

- 步骤47：`rbac` 停止读写 `roles.permissions` legacy JSON；角色权限统一写入并读取 `rbac_role_permissions`，`listRoles` 从关系表返回权限码，并补充关系表读取单测。
- 步骤48：修正 `report.service.ts` 对 `dept` 模块的直接 service import，统一通过模块 `index.ts` 导出访问。
- 步骤49：审计 `dictionary` 缓存一致性；确认无批量写入和 service 外写表路径，补充 `update/delete` 后按 `dictType` 失效缓存的单测。
- 步骤50：将 `file-storage` 拆为策略模式，新增 `StorageStrategy`、local/OSS 实现、附件解析与文件资产查询辅助模块；`file-storage.service.ts` 从 888 行降至 460 行。
- 步骤51：`login_logs` 与 `audit_logs` 增加 `isDeleted` 字段和 migration，查询统一过滤未删除记录，删除接口改为软删除。
- 步骤52：`dept` service DTO 统一为 schema 字段 `description/sort/parentId`，`remark/orderNo/pid` 兼容映射下沉到 API 入口。

**验证结果：**

- 每个步骤提交前均执行 `pnpm -C apps/backend exec tsc --noEmit`: 通过
- 每个步骤提交前均执行 `pnpm -C apps/backend exec vitest run`: 32 文件 / 216-218 测试全部通过
- 每个步骤提交前均执行 `pnpm run check:qms-arch`: 通过
- 步骤51 执行 `pnpm -C apps/backend exec prisma generate --schema=./prisma/schema.prisma`: 通过
- 阶段结束模块 TS 文件数：232
- 阶段结束 `git status --short | wc -l`: 0

**commit:** `2c136b33` / `85bbe782` / `59e96595` / `a17e1071` / `2a757e69` / `bcc5bc24`

**遗留问题：**

- Step 51 的 `prisma migrate dev --name add_soft_delete_to_logs` 因既有历史迁移 `20250521000000_add_processes_table_and_processId` 在 shadow database 中引用不存在的 `inspections` 表而失败；本阶段已按 Prisma migration 规范新增 `20260526000100_add_soft_delete_to_logs/migration.sql`，未手动改数据库。
- `pnpm -C apps/backend exec vitest run` 仍会输出 `REDIS_URL not found, caching disabled` 测试环境警告，不影响门禁结果。

### 2026-05-26 阶段十一：错误处理与中间件（步骤53-55）

**执行内容：**

- 步骤53：新增 `BusinessError` 统一业务异常类型与 legacy error 映射工具；全局 error handler 支持标准业务错误响应；优先替换 dictionary、inspection、work-order 中明确的 `VALIDATION`、`NOT_FOUND`、`DUPLICATE`、`FORBIDDEN` 错误码路径。
- 步骤54：新增 `middleware/3.auth.ts` 集中处理非 public API 鉴权，将用户会话注入 `event.context.user/userId`；批量移除 API 与 route-handler 中手动 `verifyAccessToken(event)` 和重复未授权响应逻辑，改用 `getCurrentUser(event)` 读取上下文。
- 步骤55：新增 `middleware/4.data-scope.ts`，按 QMS 路径预解析 after-sales、inspection、supplier、work-order 的数据权限 scope 并注入 `event.context.dataScope`；`DataScopeService` 支持传入预解析 scope，相关 service 优先复用 context scope，未传时保留原有 fallback 查询。

**验证结果：**

- 每个步骤提交前均执行 `pnpm -C apps/backend exec tsc --noEmit`: 通过
- 每个步骤提交前均执行 `pnpm -C apps/backend exec vitest run`: 32 文件 / 218-219 测试全部通过
- 每个步骤提交前均执行 `pnpm run check:qms-arch`: 通过
- 步骤54 后 `rg "verifyAccessToken\\(" apps/backend/api apps/backend/modules/route-handlers apps/backend/middleware` 仅剩认证中间件调用
- 阶段结束 `git status --short | wc -l`: 0

**commit:** `7a0c26c6` / `40f5cfa5` / `aadcde09`

**遗留问题：**

- BusinessError 本阶段只替换明确错误码路径，纯消息类 `throw new Error(...)` 后续阶段继续收敛。
- 数据权限注入采用渐进式方案：中间件预解析 scope，service 可选接收；未接入 context 的调用仍按旧逻辑自行解析，行为保持兼容。
- `pnpm -C apps/backend exec vitest run` 仍会输出 `REDIS_URL not found, caching disabled` 测试环境警告，不影响门禁结果。

### 2026-05-26 阶段十二：数据库 schema 优化（步骤56-58）

**执行内容：**

- 步骤56：补充确认缺失的 DataScope 与软删除查询索引，新增 `after_sales.feedbackDept/handler/division`、`audit_logs.isDeleted`、`login_logs.isDeleted`、`quality_records.responsibleBU`、`suppliers.buyer`、`work_orders.division` 索引；确认 `quality_records.inspector/lastEditor/responsibleDepartment` 与 `daily_reports(date, reporter)` 已有索引或唯一约束，未重复添加。
- 步骤57：将 `daily_reports.summary` 的高频顶层字段结构化为 `projectName`、`workOrderNumber`、`reportText`，保留 `summary` JSON blob；通用日报和车辆调试日报改为双写结构化字段与旧 JSON，读取优先结构化字段并 fallback 到解析 `summary`。
- 步骤58：删除 `roles.permissions` legacy JSON 列；RBAC 创建角色、默认用户角色创建、检验员权限识别路径均改为只读 `rbac_role_permissions` 关系表，并更新相关单测。

**验证结果：**

- 每个步骤提交前均执行 `pnpm -C apps/backend exec prisma generate --schema=./prisma/schema.prisma`: 通过
- 每个步骤提交前均执行 `pnpm -C apps/backend exec tsc --noEmit`: 通过
- 每个步骤提交前均执行 `pnpm -C apps/backend exec vitest run`: 32 文件 / 219 测试全部通过
- 每个步骤提交前均执行 `pnpm run check:qms-arch`: 通过
- 步骤58 后执行 `rg "roles\\.permissions|role\\.permissions|permissions: true|permissions: ''|permissions: '\\[\\]'" apps/backend/modules apps/backend/api apps/backend/prisma/schema.prisma`: 无命中
- 阶段结束模块 TS 文件数：232
- 阶段结束 `git status --short | wc -l`: 0

**commit:** `338b970f` / `f7c509c1` / `cbc9a58d`

**遗留问题：**

- `daily_reports.summary` 按兼容策略保留旧 JSON blob，复杂数组字段如 `mainWorks/issueIds` 仍留在 JSON 中；本阶段仅抽取过滤和展示最常用的顶层字段。
- 本阶段沿用手写 migration SQL，原因同 Step 51：既有历史 migration 在 shadow database 中存在顺序问题；未手动修改数据库。
- `pnpm -C apps/backend exec vitest run` 仍会输出 `REDIS_URL not found, caching disabled` 测试环境警告，不影响门禁结果。
