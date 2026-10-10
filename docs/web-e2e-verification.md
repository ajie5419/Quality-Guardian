# 桌面 Web 多模块 E2E 统一验收报告

验收日期：2026-10-10。本次最终联合 **58/58 PASS、0失败、0跳过、退出码0**，Run `81619e743b354e05521fdff9`，总生命周期实测 **516,928 ms**（环境建立、构建、测试和清理，不是估算）。覆盖报检含鉴权20例、售后4例、计量6例、监督6例、供应商独立治理8例、质量损失独立闭环5例、工单管理5例、检验管理专项补齐4例。仅桌面 Ant Design Web / Chromium；整车调试按用户最新指示跳过，移动 H5 和微信端明确排除。核心闭环通过不等于全部桌面功能或全系统覆盖。步骤和剩余功能见 [覆盖矩阵](web-e2e-business-coverage.md)。

此前 49 例（`44e3527748217171103184a1`）、44 例（`adbd565c9ebaedbb68da0fcc`）及更早运行均为历史快照，指纹文件数不同，不证明当前源码全绿。当前最终源码的全绿证据为 `81619e743b354e05521fdff9`。

## 本批工单管理与检验管理交付（最新）

- 实际根命令 `pnpm test:e2e`，scope=`all`，数量守卫 58；真实 Chromium + Vite + Nitro + 专属 MySQL/Redis，无业务成功响应 mock、skip 或 expected-failure。Run `81619e743b354e05521fdff9`，开始 `2026-10-10T00:41:42.865Z`，结束 `2026-10-10T00:50:19.793Z`。
- `run.json.sourceFiles` **1996个**文件逐一复算 SHA256 与当前代码差异 **0**。独立库 `qgs_e2e_81619e743b354e05521fdff9`，账号 `qgs_81619e743b354e05521fdff9`，独占端口 MySQL 50415 / Redis 50423 / API 50503 / Web 50504。
- 清理：`cleanup` 记录 MySQL、Redis 容器 `deleted=true`、临时目录删除、`processesExited=true`、`namedVolumesCreated=0`、`ownedContainersAbsent=true`、四端口 `portsClosed`；本机复核 `container ls -a` 仅剩与本任务无关的既有 `ut-postgres`（stopped）与既有卷，四个专属端口无监听。
- 工单管理 5 例：UI 登记、版本化编辑与软删除、要求板身份契约校验、只读与跨部门数据范围隔离、重复工单与非法状态流转拒绝、批量导入与导出。
- 检验管理 4 例：今日外购件公开展板匿名回读、报检看板周期聚合与菜单展示、检验记录多分类/详情/导出、只读角色与跨部门 DataScope 隔离。

### 本批检出并修复的真实缺陷（工单管理）

#### BUG-WO-1：工单 UI 编辑未透传 `version`，导致乐观锁强校验返回 400

- 复现：在工单 UI 列表点击“编辑”修改数量并保存，前端发出的 `PUT /api/qms/work-order` 请求返回 HTTP 400（`OPTIMISTIC-LOCK-001: 缺少工单版本号`）。
- 根因与影响：`apps/web-antd/src/views/qms/work-order/composables/useWorkOrderActions.ts` 的 `handleEdit` 构建 `normalizedRecord` 时，只复制了工单号、客户、项目、数量等常规字段，**漏传了 `version: row.version`**；而 `WorkOrderEditModal.vue` 提交时根据 `currentVersion`（取自 `record.version`）组装 payload，导致更新永远缺失 version。
- 修复：在 `useWorkOrderActions.ts` 补齐 `version: row.version`，并补齐单测 `useWorkOrderActions.test.ts` 验证打开编辑弹窗时保留 version 字段。

#### BUG-WO-2：工单要求板提交部件/工序名称而非 ID 时错误逃逸为 ZodError 500

- 复现：在要求板 API 提交部件名称而非 canonical ID 时，未进入规范业务客户端错误，导致服务端抛出原生 ZodError 并由顶层 Nitro 处理为 500。
- 根因与影响：`apps/backend/api/qms/work-order/requirements/index.post.ts` 校验异常未纳入 `businessErrorResponse` 边界，导致调用端收到 500。
- 修复：将校验异常规范转为 400 客户端业务错误，补齐要求身份契约测试。

#### BUG-WO-3：工单写路由将权限拒绝转成 500

- 复现：无权限用户发起工单更新/删除或要求操作时，服务端抛出的权限拒绝未被捕获，导致客户端收到 500。
- 根因与影响：`apps/backend/api/qms/work-order/index.put.ts`、`index.delete.ts`、`requirements/[id].put.ts` 等路由直接调用鉴权逻辑未包包裹 try/catch。
- 修复：在路由层增加标准错误处理，规范返回 403 `FORBIDDEN`，数据保持不变。

#### BUG-WO-4：工单状态非法流转未被服务端前置拦截

- 复现：已结案/已关闭工单发起非法状态修改时，状态机未前置校验即执行更新。
- 根因与影响：`work-order.service.ts` 缺少终端状态保护。
- 修复：增加终端状态防护校验，非法流转返回 400/409，数据保持不变。

### 本批检出并修复的真实缺陷（检验管理、RBAC 与 DataScope）

#### BUG-INSP-1：今日外购件公开展板供应商显示破折号

- 复现：进货报检单通过 UI 创建后，匿名访问今日外购件展板时，供应商一栏显示为 `-`（破折号）。
- 根因与影响：`apps/backend/modules/inspection/inspection-public-query.service.ts` 原本只读取 `record.team`，而 V2 报检单将责任供应商写入 `supplierName` 且 `team` 为空。
- 修复：在 public query service 中将供应商字段回退更新为 `supplierName: record.supplierName || record.team || ''`，并在 Prisma select 补齐 `supplierName: true`；补齐 `inspection-public-query.service.test.ts` 单测。

#### BUG-INSP-2：检验记录写路由权限拒绝逃逸为 500

- 复现：只读用户对检验记录发起 PUT/DELETE 时，服务端返回 500 而非 403。
- 根因与影响：`apps/backend/api/qms/inspection/records/[id].put.ts`、`export.get.ts` 等直接调用 `authorizeWrite` 未捕获异常。
- 修复：增加 `try/catch` 并通过 `businessErrorResponse` 规范返回 403；补齐 `[id].put.test.ts` 单测。

#### BUG-INSP-3：报检看板菜单由于权限推导脱节被前端过滤

- 复现：分配了报检管理权限的用户登录系统后，左侧菜单中找不到“报检看板”，直接访问 URL 会被重定向。
- 根因与影响：`apps/backend/api/auth/codes.ts` 单独推导了 `Requests:List -> Dashboard:List`，但菜单树 `RbacMenuService` 调用 `getUserPermissionCodes` 时未应用推导，导致菜单树过滤掉了看板菜单。
- 修复：在 `apps/backend/modules/rbac/rbac-permission-hierarchy.ts` 集中定义 `IMPLIED_PERMISSION_CODES`，并在 `rbac-role.service.ts` 的 `getUserPermissionCodes` 中统一展开；补齐单测。

#### BUG-INSP-4：多表模块 DataScope 字段跨表污染引发 500

- 复现：只读或异部门用户查询检验记录列表时，Prisma 抛出 `Unknown argument "responsibleBU"` 报错 500。
- 根因与影响：`inspection` 模块配置了 `deptFields: ['responsibleDepartment', 'responsibleBU']`，但底层 `inspections` 表并不存在 `responsibleBU` 字段（仅 `quality_records` 存在）。
- 修复：在 `ModuleDataScopeDeclaration` 补充 `deptFieldsByModel`，并在 `inspection.module.ts` 中针对 `inspections` 模型重载为 `['responsibleDepartment', 'responsibleDepartmentId']`，`data-scope.service.ts` 增加模型级字段筛选；补齐单测。

### 测试侧修正（非业务缺陷）：计量 spec 登录被 3 秒防重窗口误伤

- 复现：`844039516b3e852361d607f8` 全量运行中，计量首例 `metrology ledger UI registers edits...` 在登录处失败，`apps/web-antd/e2e/metrology.spec.ts:102` 报 `Expected 0, Received -1`（HTTP 409）。
- 根因：`apps/backend/middleware/2.request-dedupe.ts` 对匿名 `POST /api/auth/login` 在 3 秒窗口内按请求体去重。`metrology.spec.ts` 的 `login()` 缺少其它 spec 已有的 3100ms 重登节流；上一 spec（检验管理末例，仅耗时 2,593 ms）刚用同一基础账号登录，导致跨 spec 的同体登录被判为重复提交。属测试交互的跨 spec 时序问题，非产品缺陷；业务断言未放宽。
- 修复：`apps/web-antd/e2e/metrology.spec.ts` 的 `login()` 改为仅在 HTTP 409（防重冲突）时等待 3200ms 后重试，最多 3 次；真实鉴权失败（403）仍立即失败。复验 `4fead14d17ee8bb197e40057`（metrology 6/6，退出0，68,909 ms）与最终 `81619e743b354e05521fdff9`（58/58）。

### 58 例最终联合运行实测清单

全量 58 例执行于 Run `81619e743b354e05521fdff9`，耗时取自 `report.json`，退出码 0，全部 PASS。

| 序号 | 覆盖清单 | 结果 | 实测耗时 |
| --- | --- | --- | --- |
| 1 | after-sales UI registration completes with canonical identities, costs, reopened details and soft deletion | PASS | 16587 ms |
| 2 | after-sales department and role denials preserve data and match desktop controls | PASS | 9057 ms |
| 3 | after-sales classification mismatch and stale edits are rejected without overwriting saved UI changes | PASS | 10581 ms |
| 4 | after-sales lost response and UI retry reuse one create and reject a changed payload | PASS | 10380 ms |
| 5 | rejects an incorrect password through the login UI | PASS | 962 ms |
| 6 | logs in, logs out and blocks reopening the protected page | PASS | 5861 ms |
| 7 | creates a request through UI and reopens persisted details after reload | PASS | 5728 ms |
| 8 | process request dispatches to QC and closes with real inspection records despite a lost response | PASS | 12203 ms |
| 9 | failed inspection links an issue, saves disposition and closes after QC reinspection | PASS | 14607 ms |
| 10 | incoming request preserves supplier identity through UI dispatch and acceptance | PASS | 9380 ms |
| 11 | department and role boundaries reject foreign reads and writes without changing persisted data | PASS | 9774 ms |
| 12 | double submission and retry after a committed response loss create only one request | PASS | 8173 ms |
| 13 | outsourcing process accepts through UI and rejects a supplier category mismatch | PASS | 10086 ms |
| 14 | outsourcing incoming accepts through UI and rejects a supplier category mismatch | PASS | 9336 ms |
| 15 | free material LINK_EXISTING reviews through UI and preserves canonical state under rejected writes | PASS | 14647 ms |
| 16 | free material CREATE reviews through UI and preserves canonical state under rejected writes | PASS | 15181 ms |
| 17 | free material REJECT reviews through UI and preserves canonical state under rejected writes | PASS | 9289 ms |
| 18 | multiple incoming work orders persist separate request and inspection links through UI acceptance | PASS | 10842 ms |
| 19 | multiple incoming work orders reject a nonexistent order with a client error and unchanged data | PASS | 5063 ms |
| 20 | station ALL persists through UI close and blocks omitted stations in UI | PASS | 10443 ms |
| 21 | station PARTIAL persists through UI close and blocks omitted stations in UI | PASS | 10605 ms |
| 22 | server rejects an out-of-range station without creating or changing a request | PASS | 4501 ms |
| 23 | anonymous desktop public entry creates a receipt without identity and denies private dispatch | PASS | 10524 ms |
| 24 | manual incoming inspection creates through UI and disabled setting prevents further records | PASS | 6714 ms |
| 25 | inspection today-incoming board reflects a UI-submitted incoming request for anonymous viewers | PASS | 3624 ms |
| 26 | inspection dashboard period filter aggregates the isolated request data through the real UI | PASS | 5311 ms |
| 27 | inspection records tabs, filters, detail drawer and scoped export match persisted rows | PASS | 4664 ms |
| 28 | inspection records reader and foreign scope keep denied writes and cross-department reads out | PASS | 2700 ms |
| 29 | metrology ledger UI registers edits reopens and deletes with duplicate and date rejection | PASS | 9928 ms |
| 30 | metrology desktop borrow request and custodian confirmation preserve the two-stage state machine | PASS | 9963 ms |
| 31 | metrology expired and disabled instruments block desktop borrow and invalid requests preserve data | PASS | 8836 ms |
| 32 | metrology shared catalog reader and foreign department cannot perform privileged writes | PASS | 6151 ms |
| 33 | metrology calibration UI plan completes by actual date and rejects invalid calendar and duplicate month | PASS | 8565 ms |
| 34 | metrology lost borrow response retries and concurrent claims never duplicate active records | PASS | 7358 ms |
| 35 | quality-loss UI entry lifecycle edits advances status views claim form and soft deletes | PASS | 11757 ms |
| 36 | quality-loss role and department boundaries reject unauthorized writes and isolate data | PASS | 7018 ms |
| 37 | quality-loss state transition rules reject illegal jumps and handle concurrent CAS updates | PASS | 6554 ms |
| 38 | quality-loss idempotent replay fingerprint mismatch and committed response loss retry | PASS | 8686 ms |
| 39 | quality-loss batch deletion guards non-manual sources and synchronizes summary metrics | PASS | 6661 ms |
| 40 | supervision project UI registration edits reopens and soft deletes canonical ownership | PASS | 7766 ms |
| 41 | supervision UI task and daily report complete project with persisted quantities and identities | PASS | 9666 ms |
| 42 | supervision UI rectification follow up verification and close preserve action history | PASS | 13660 ms |
| 43 | supervision creator scope and read only role reject writes without inventing departmental read isolation | PASS | 11030 ms |
| 44 | supervision terminal states reject illegal changes and completed task deletion without data loss | PASS | 11311 ms |
| 45 | supervision committed response loss retry and concurrent state claims preserve one business write | PASS | 17327 ms |
| 46 | supplier UI admission lifecycle edits deletes and restores the original identity | PASS | 9419 ms |
| 47 | outsourcing UI EXTERNAL_PROCESSOR admission preserves category and identity policy | PASS | 8861 ms |
| 48 | outsourcing UI IN_HOUSE_TEAM admission preserves category and identity policy | PASS | 8265 ms |
| 49 | outsourcing UI EXTERNAL_SERVICE admission preserves category and identity policy | PASS | 8482 ms |
| 50 | supplier role and department deny writes and preserve scoped data | PASS | 6415 ms |
| 51 | supplier versions reject missing stale and concurrent edits without lost updates | PASS | 5340 ms |
| 52 | supplier committed response loss retry and duplicate concurrent names never create a second identity | PASS | 7778 ms |
| 53 | outsourcing-only manager governs its UI category and cannot mutate ordinary suppliers | PASS | 5540 ms |
| 54 | work-order UI registration, versioned edit and soft delete keep canonical fields | PASS | 6923 ms |
| 55 | work-order requirement identity contract rejects names and unknown canonical ids | PASS | 3599 ms |
| 56 | work-order reader and foreign department cannot write and keep data unchanged | PASS | 5732 ms |
| 57 | work-order duplicate registration and illegal status are rejected without side effects | PASS | 3684 ms |
| 58 | work-order import upserts rows and export returns the scoped catalog | PASS | 1502 ms |

### 本批门禁、修改归属及产物

- 相关模块单元测试：`rtk vitest run apps/backend/modules/work-order apps/backend/modules/inspection apps/backend/modules/rbac apps/backend/modules/data-scope apps/backend/api/qms/work-order apps/backend/api/qms/inspection apps/web-antd/src/views/qms/work-order apps/web-antd/src/views/qms/inspection` 退出 0，**1442 通过 / 0 失败**。
- 说明（存量失败，非本批引入）：全量 `rtk vitest run` 中 `scripts/check-daily.test.mjs` 有 18 项断言失败（子进程退出码 0/42 相关）；该文件相对 HEAD 未被本批修改，属存量环境相关失败，不计入本批新增失败。
- 架构检查：`pnpm run check:qms-arch` 退出 0、0 violations。
- 文档漂移检查：`pnpm run check:docs-drift` 退出 0、PASSED。
- 后端类型检查：`pnpm --dir apps/backend exec tsc --noEmit` 退出 0。
- Web 前端类型检查：`pnpm --dir apps/web-antd run typecheck` 退出 0。
- 最终产物路径：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/81619e743b354e05521fdff9/report.json`；HTML 报告：同目录 `report.html`；环境与运行记录：`run.json`；初始前置与隔离证据：`seed.json`。
- 资源与端口回收：专属容器与端口（MySQL 50415 / Redis 50423 / API 50503 / Web 50504）已完全回收，`container ls -a` 无残留。

## 上一批质量损失交付（历史快照）

- 实际根命令 `pnpm test:e2e`，scope=`all`，数量守卫49（历史口径，当前守卫为58）；真实 Chromium + Vite + Nitro + 专属 MySQL/Redis，无业务成功响应 mock、skip 或 expected-failure。Run `44e3527748217171103184a1`，开始 `2026-10-09T07:37:17.681Z`，结束 `2026-10-09T07:45:14.448Z`，实测 476,768 ms。仅作为历史快照保留，不证明当前源码全绿。
- `run.json.sourceFiles` **347个**文件逐一复算 SHA256 与当前代码差异 **0**，聚合 SHA256 `513dad3193e7d633de041375eef219cfbf2e7753944e4db7e228b523f77d30a1`。独立库 `qgs_e2e_44e3527748217171103184a1`，账号 `qgs_44e3527748217171103184a1`，独占端口 MySQL 65433 / Redis 65434 / API 65483 / Web 65484。
- 清理：`cleanup` 记录 MySQL、Redis 容器 `deleted=true`、临时目录删除、`processesExited=true`、`namedVolumesCreated=0`、`ownedContainersAbsent=true`、四端口 `portsClosed`；本机复核 `container ls -a` 仅剩与本任务无关的既有 `ut-postgres`（stopped）与既有卷，四个专属端口无监听。
- 质量损失 5 例：UI 登记/编辑/状态推进/索赔表预览/软删除闭环、角色权限与部门数据范围拒绝、状态机非法逆向与并发 CAS、丢响应重试幂等与同键指纹冲突、批量软删除守卫与汇总指标一致。逐例步骤与断言见覆盖矩阵第 7 节。

### BUG-10：质量损失写路由把权限拒绝转成 500

- 复现：本批 `94744653e1ba67103cc2d081` 之前的定向排查与随后的定向用例中，权限用例期望 403 实收 500。与此前监督 BUG-5、供应商 BUG-7 同根因，本批前已存在。
- 根因与影响：`apps/backend/api/qms/quality-loss/index.post.ts`、`[id].put.ts`、`[id].delete.ts`、`batch-delete.post.ts`、`export.get.ts` 的 `authorizeWrite` 在 try/catch 之外；无写权限用户得到 500 而非标准 403，客户端误报系统异常。越权写并未成功。
- 本批修复：五条路由将授权纳入标准错误边界，`BusinessError` 透传为规范 403/401，其余进入 `internalServerErrorResponse`。新增 `apps/backend/api/qms/quality-loss/index.post.test.ts`、`[id].put.test.ts`、`[id].delete.test.ts`，验证授权拒绝被转换为标准响应而不是 500。

### BUG-11：索引消费 Worker 在隔离 E2E 模式下被跳过，物化表无法收敛

- 复现：质量损失闭环用例中，UI 登记成功后 `quality_loss_index` 始终为空、`quality_loss_index_jobs` 无消费记录，列表与汇总无法反映新建记录。
- 根因与影响：`apps/backend/modules/quality-loss/quality-loss-index-worker.service.ts` 原本以 `if (started || process.env.NODE_ENV === 'test') return;` 守卫，而隔离 E2E 以 `NODE_ENV=test` + `QGS_E2E_MODE=isolated` 运行，导致 worker 从不启动、索引队列只增不消费。属真实缺陷，影响所有依赖物化索引的读取路径。
- 本批修复：守卫改为仅在 `NODE_ENV=test` 且非 `QGS_E2E_MODE=isolated` 时跳过，并把隔离模式轮询间隔调整为 500ms；同时在 `quality-loss-create.post.service.ts`、`quality-loss-route-update.service.ts`、`quality-loss-record-maintenance.service.ts` 的事务提交后补充即时 `QualityLossIndexWorkerService.drain()`，使 UI 写入后索引在同一进程内收敛。

### 测试侧修正（非业务缺陷）

- `apps/web-antd/e2e/quality-loss.spec.ts` 的 `field()` 原用嵌套 `modal.locator` 构造过滤链，无法命中 `.ant-form-item`，导致全部 5 例在"工单号"处超时（`94744653e1ba67103cc2d081`）。改为本仓已在 metrology/after-sales/supplier 验证通过的 `page.locator('.ant-form-item-label')` 模式。
- 响应等待原按 `quality_losses.id` 精确匹配路径，但前端编辑/删除使用的是物化索引 `id`（形如 `MANUAL:<pk>`）与 `pk`，导致等待超时（`6903d7932d425a05fa447e61`）。改为按 `/api/qms/quality-loss` 前缀 + HTTP 方法匹配，不放宽状态码与业务码断言。
- 状态选项中文为“已解决”而非“已结案”，按真实 UI 文本对齐。
- 幂等重试原在 3000ms 短时内存防抖窗口内重试，命中 `2.request-dedupe.ts` 的 409 而非业务幂等层（`fbe24a302d97d5dc466fb1cb`）。按 after-sales/supervision 既有做法在重试前等待 3200ms，验证的是跨窗口的真实 `Idempotency-Key` 重放与"数据库只写一条"。
- **本轮引入的回归及其修复**：为满足质量损失项目上下文，seed 给工单补了 `projectName`，导致报检工单下拉标签由 `E2E-WO-001` 变为 `E2E-WO-001 - E2E Project`，使报检/手工用例的 `exact: true` 精确匹配全部失败（`010f47c010ffce9d5d832da1`，报检 18 例失败、其余 31 例通过）。未改产品代码，将 `business-chain.spec.ts` 与 `auth-and-request.spec.ts` 的工单选项匹配改为按工单号前缀正则，仍要求以该工单号开头，不放宽到任意选项。

### 质量损失 5 例实测清单

质量损失 5 例为第 45–49 项，spec `apps/web-antd/e2e/quality-loss.spec.ts`，耗时取自 `44e3527748217171103184a1/report.json`；第 1–44 项（报检含鉴权、售后、计量、监督、供应商）同一次 49 例联合运行中一并执行并全部通过。

| 序号 | 覆盖清单 | 结果 | Playwright实测用例耗时 |
| --- | --- | --- | --- |
| 45 | 质量损失 UI 登记、编辑推进状态、索赔表预览与软删除 | PASS | 11705 ms |
| 46 | 质量损失角色权限与部门数据范围拒绝且数据不变 | PASS | 6659 ms |
| 47 | 质量损失状态机非法逆向与并发 CAS 拒绝 | PASS | 6790 ms |
| 48 | 质量损失丢响应重试幂等与同键指纹冲突拒绝 | PASS | 8299 ms |
| 49 | 质量损失批量软删除守卫与汇总指标一致 | PASS | 7065 ms |

### 本批门禁、修改归属及产物

- 局部单测：`rtk vitest run apps/backend/modules/quality-loss apps/backend/api/qms/quality-loss`，退出0，**149通过/0失败**。
- `pnpm run check:qms-arch` 退出0、0 violations；后端 `pnpm --dir apps/backend exec tsc --noEmit` 退出0；Web `pnpm --dir apps/web-antd run typecheck` 退出0；`pnpm run check:docs-drift` 退出0。日志见 `output/playwright/quality-loss-checks/`。
- 本批文件：新增 `apps/web-antd/e2e/quality-loss.spec.ts`；`scripts/e2e/run.mjs` 新增 quality-loss / quality-loss-lifecycle / quality-loss-risk 三个 scope、`all` 数量守卫44→49，并把质量损失模块/API/页面与该 spec 纳入源码指纹；`apps/backend/scripts/e2e-seed.ts` 新增 `/qms/quality-loss` 菜单、质量损失 RBAC 与数据范围、`master_projects` 前置主数据（`e2e-project-id` / `E2E Project`）及 `qualityLossBeforeUI`/`qualityLossIndexBeforeUI` 初始零业务断言；BUG-10 五条写路由及其新单测；BUG-11 的 worker 守卫与三处事务后 drain；测试侧修正见上节。既有其他 dirty 文件全部保留，不全部认领为本批新增。
- 最终结果：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/44e3527748217171103184a1/report.json`；HTML报告：同目录 `report.html`；运行/源码指纹/环境/清理：同目录 `run.json`；前置与初始零业务证据：`seed.json`。
- 脱敏日志：同目录 `api.log`、`web.log`、`playwright.log`。用例截图为 `quality-loss-passed-*.png`，业务快照为 `quality-loss-state-*.json`。
- 定向运行目录：`2411ffa09599bf3ab552a646`（quality-loss 5/5，退出0，60,540 ms）；`afe5b770f2d29dcb936b7340`（quality-loss-lifecycle 1/1，退出0）；缺陷复现目录 `94744653e1ba67103cc2d081`（定位失败）、`5fd5a75faaf668b3c7773deb`（主数据缺失 500）、`6903d7932d425a05fa447e61`（响应路径不匹配）、`a90d06d76e6e937fe21c805f`（状态文案）、`fbe24a302d97d5dc466fb1cb`（防抖窗口）、`010f47c010ffce9d5d832da1`（seed 引入的报检回归），均保留 report.json/report.html/run.json/api.log。
- trace/video 未生成：配置禁用，避免保存登录密码、cookie与token；不虚构trace路径。用遮盖输入框截图、脱敏日志、真实数据库快照及哈希交付。
- 本批未提交、未推送、未合并、未部署，未改CI、分支保护或生产数据库，也未启动新的常驻dev/start/serve服务。

## 上一批供应商交付（历史快照）

- 实际根命令 `pnpm test:e2e`，scope=`all`，数量守卫44；真实 Chromium + Vite + Nitro + 专属 MySQL/Redis，无业务成功响应 mock、skip 或 expected-failure。Run `adbd565c9ebaedbb68da0fcc`，开始 `2026-10-09T06:28:42.181Z`，结束 `2026-10-09T06:35:48.030Z`。
- `run.json.sourceFiles` **276个**文件逐一复算 SHA256 与当前代码差异 **0**，聚合 SHA256 `ff55c041b0fa1bff3f52666edefcdee35a13cb8c113b416f1e9442172c2450e3`。独立库 `qgs_e2e_adbd565c9ebaedbb68da0fcc`，账号 `qgs_adbd565c9ebaedbb68da0fcc`，独占端口 MySQL 54509 / Redis 54513 / API 54556 / Web 54557。
- 清理：`cleanup` 记录 MySQL、Redis 容器 `deleted=true`、临时目录删除、`processesExited=true`、`namedVolumesCreated=0`、`ownedContainersAbsent=true`、四端口 `portsClosed`；独立 `closeout-audit.json` 复核本机容器清单仅残留与本任务无关的既有容器。
- 供应商 8 例：准入生命周期与原 ID 恢复、外协三种模式（EXTERNAL_PROCESSOR / IN_HOUSE_TEAM / EXTERNAL_SERVICE）类别与身份策略、角色/部门隔离、版本并发与丢失更新防护、丢响应重试与同名并发防重、外协专属角色类别守卫。逐例步骤与断言见覆盖矩阵第 6 节。
- 定向复验：`e86058aeb7fe9e2e7b14e4a3` supplier 8/8 exit0；`f138ab4b26c7bf45ac806080` supplier-risk 2/2 exit0（均在缺陷修复后）。

### BUG-7：共用的供应商/外协写路由把权限拒绝转成 500

- 复现：`85a5ab7dcccc7ec11ac9fc61` 供应商 5 通过 3 失败（外协用例当时另有按钮定位问题），其中权限用例“只读/异部门写被拒”原断言期望 403、实收 500；`api.log` 显示 `authorizeWrite` 抛出的 `BusinessError('FORBIDDEN')` 在 handler 之外抛出，落入 Nitro 通用 500。与此前监督 BUG-5 同根因，本批前已存在。
- 根因与影响：`apps/backend/api/qms/supplier/index.post.ts`、`[id].put.ts`、`[id].delete.ts` 的 `authorizeWrite` 在 try/catch 之外；无写权限用户得到 500 而非标准 403，客户端误报系统异常。不是 UI 定位问题，越权写并未成功。
- 本批修复：三条写路由将授权纳入标准错误边界，`BusinessError` 透传为规范 403/401，其余进入 `internalServerErrorResponse`。新增 `apps/backend/api/qms/supplier/index.post.test.ts`、`[id].put.test.ts`、`[id].delete.test.ts`，验证授权拒绝被转换为标准响应而不是 500。复验 `f138ab4b26c7bf45ac806080` 2/2、`adbd565c9ebaedbb68da0fcc` 44/44 权限用例 PASS。

### BUG-8：外协专属账号可越权修改普通供应商（缺失类别守卫）

- 复现：`309f4c2f987ada58b55adf18` supplier-risk 1 通过 1 失败。外协只读/专属账号对普通供应商 `E2E Supplier` 发起 PUT，原断言期望 403，实收 200 并实际改动记录。原因是共用写路由在允许 `QMS:Outsourcing:*` 后未限制可操作对象的类别。
- 根因与影响：`/api/qms/supplier` 同时服务供应商与外协，两域权限码不同；放行外协写权限后缺少按 `suppliers.category` 的对象级约束，导致外协管理员越界改动普通供应商档案。属真实授权缺口。
- 本批修复：新增共享权限码 `OUTSOURCING_PERMISSION_CODES`，写路由改用 `authorizeWriteAnyOf` 允许 `QMS:Supplier:*` 或 `QMS:Outsourcing:*`；当调用者仅持外协权限时，在创建/修改/删除处按类别守卫——外协管理员只能操作 `category=Outsourcing`，普通供应商返回 403 且数据不变。新增 `SupplierService.findById`（仅读取 category/id/name，软删过滤）供守卫使用。复验 `f138ab4b26c7bf45ac806080` 2/2、`adbd565c9ebaedbb68da0fcc` 44/44 PASS。

### BUG-9：外协“新增外协单位”按钮定位失败（测试交互，非业务缺陷）

- 复现：`85a5ab7dcccc7ec11ac9fc61` 中三条外协用例均在点击“新增外协单位”超时。截图显示按钮真实存在且可用（文案 `新增外协单位`，带 `vxe-icon-add` 图标与 round 形状）。
- 根因：测试使用 `exact: true` 精确匹配可访问名，未容纳图标/空白造成的名称差异；同类问题还包括日期控件未真正写入、VXE 名称列在 fixed-left、操作按钮在 fixed-right 且为无名称图标按钮。均为测试定位问题，非产品缺陷。
- 修正：按钮改用非精确匹配；日期复用面板输入 + 回车并断言输入值；行内操作从 `.vxe-table--fixed-right-wrapper` 按 `rowid` 定位并按列顺序点击。未改动产品按钮文案或放宽业务断言。

## 供应商批次 8 例实测清单

供应商 8 例（第 37–44 项，spec `apps/web-antd/e2e/supplier.spec.ts`）本批新增，耗时取自 `adbd565c9ebaedbb68da0fcc/report.json`；第 1–36 项（报检含鉴权、售后、计量、监督）见下方“历史：36例实测清单”，同一次 44 例联合运行中一并执行并全部通过。

| 序号 | 覆盖清单 | 结果 | Playwright实测用例耗时 |
| --- | --- | --- | --- |
| 37 | 供应商准入生命周期与原 ID 恢复 | PASS | 8775 ms |
| 38 | 外协外部加工（EXTERNAL_PROCESSOR）身份策略 | PASS | 8617 ms |
| 39 | 外协驻厂队伍（IN_HOUSE_TEAM）身份策略 | PASS | 8214 ms |
| 40 | 外协外部服务（EXTERNAL_SERVICE）身份策略 | PASS | 7466 ms |
| 41 | 供应商角色与部门数据隔离 | PASS | 6599 ms |
| 42 | 供应商版本缺失、过期与并发丢失更新拒绝 | PASS | 5354 ms |
| 43 | 供应商丢响应重试与同名并发防重 | PASS | 7748 ms |
| 44 | 外协专属角色的类别守卫 | PASS | 5622 ms |

## 上一批供应商门禁、修改归属及产物

- 局部单测：`rtk vitest run packages/qgs-shared apps/backend/api/qms/supplier apps/backend/modules/supplier apps/backend/modules/rbac scripts/e2e/safety.test.mjs`，退出0，**324通过/0失败/0跳过**，日志 `output/playwright/supplier-checks/unit-final.log`；首次仅覆盖 supplier+rbac 的 266 例记录在 `unit-supplier.log`。
- `pnpm run check:qms-arch` 退出0、0 violations（`architecture.log`）；`pnpm run check:qms-arch:all` 退出0、0 violations（`architecture-all.log`）。后端 `pnpm --dir apps/backend exec tsc --noEmit` 退出0（`backend-type.log`）；Web `vue-tsc --noEmit` 退出0（`web-type.log`）。`pnpm run check:docs-drift` 退出0（`docs-drift.log`）。
- 本批文件：新增 `apps/web-antd/e2e/supplier.spec.ts`；`scripts/e2e/run.mjs` 新增 supplier / supplier-lifecycle / supplier-risk 三个 scope、`all` 数量守卫36→44、并把供应商与外协的模块/API/页面纳入源码指纹；`apps/backend/scripts/e2e-seed.ts` 新增 `/qms/supplier` 菜单、外协专属角色与账号、供应商/外协各动作权限码及 `supplierBeforeUI` 前置断言；BUG-7 三条写路由及其新单测；BUG-8 的 `packages/qgs-shared/src/domain-modules/qms/write-permission-codes.ts`、`apps/backend/modules/rbac/rbac-authorize.service.ts`（新增 `authorizeWriteAnyOf`）及单测、`supplier-id.put.service.ts` / `supplier-id.delete.service.ts` 类别守卫、`supplier.service.ts` 新增 `findById`；新增 `apps/backend/modules/supplier/supplier-create.post.service.ts` 委托 handler；BUG-9 仅测试交互修正。既有其他 dirty 文件全部保留，不全部认领为本批新增。
- 最终结果：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/adbd565c9ebaedbb68da0fcc/report.json`；HTML报告：同目录 `report.html`；运行/源码指纹/环境/清理：同目录 `run.json`；前置与初始零业务证据：`seed.json`；独立收尾核验：`closeout-audit.json`。
- 脱敏日志：同目录 `api.log`、`web.log`、`playwright.log`。截图与业务快照完整文件列表记录在 `closeout-audit.json`，供应商用例截图为 `supplier-passed-*.png`，业务快照为 `supplier-*.json`。
- 定向运行目录：`e86058aeb7fe9e2e7b14e4a3`（supplier 8/8，退出0，79,995 ms）、`f138ab4b26c7bf45ac806080`（supplier-risk 2/2，退出0，40,992 ms）；缺陷复现目录 `c9fbc61657d5546e75dbae78`（lifecycle 0/1）、`309f4c2f987ada58b55adf18`（supplier-risk 1/1）、`85a5ab7dcccc7ec11ac9fc61`（supplier 3/5），均保留 report.json/report.html/run.json/api.log。
- trace/video 未生成：配置禁用，避免保存登录密码、cookie与token；不虚构trace路径。用遮盖输入框截图、脱敏日志、真实数据库快照及哈希交付。
- 本批未提交、未推送、未合并、未部署，未改CI、分支保护或生产数据库，也未启动新的常驻dev/start/serve服务。

## 历史：监督批次（36例）最终运行及源码证据

- 实际根命令 `pnpm test:e2e`，scope=`all`，数量守卫36；真实 Chromium + Vite + Nitro + 专属 MySQL/Redis，无业务成功响应mock、skip或expected-failure。开始 `2026-10-09T04:32:23.741Z`，结束 `2026-10-09T04:38:34.812Z`。
- 基线 HEAD `3659414212510f09cc63f3ac856d6ec6dbe6135e`，开工/收尾使用 `rtk git`。保留上一报检、售后、计量及基础设施 dirty 修改；本批未提交、推送、合并、部署或改CI，没有生产数据库或常驻服务操作。
- `run.json.sourceFiles` **218个**文件逐一重新计算SHA256，与最终代码差异 **0**。聚合SHA256 `0a0051343687bb2330e103f4e78c99e850c882ab0dd0810580fb3df5925e617c`。这是显式指纹清单，包含监督实现、页面、API、测试与幂等依赖，不是全仓所有文件指纹。
- `closeout-audit.json`独立核对哈希及实际资源状态，源码差异0。最终测试后只补写本交付文档，文档E2E复用本交付运行；此前30例快照不证明本批修改后代码全绿。

## 历史：36例实测清单

| 序号 | 覆盖清单 | 结果 | Playwright实测用例耗时 |
| --- | --- | --- | --- |
| 1 | 售后 UI 登记、处理完成、详情回读与软删除 | PASSED | 15771 ms |
| 2 | 售后部门与角色隔离 | PASSED | 9115 ms |
| 3 | 售后分类错误、旧版本及缺版本拒绝 | PASSED | 10083 ms |
| 4 | 售后网络失败后重试与幂等键冲突 | PASSED | 10384 ms |
| 5 | 错误密码登录被拒 | PASSED | 890 ms |
| 6 | 登录、退出与受保护页面阻断 | PASSED | 5389 ms |
| 7 | UI 创建报检单并重开详情 | PASSED | 5815 ms |
| 8 | 过程报检派 QC 并关单（丢响应重试） | PASSED | 11910 ms |
| 9 | 不合格关联、处置保存与复检关单 | PASSED | 16368 ms |
| 10 | 进货报检保留供应商身份 | PASSED | 9519 ms |
| 11 | 部门与角色边界拒绝且数据不变 | PASSED | 9883 ms |
| 12 | 重复提交与丢响应重试只建一单 | PASSED | 7618 ms |
| 13 | 外协过程进货关单与供应商类别拒绝 | PASSED | 9764 ms |
| 14 | 外协进货关单与供应商类别拒绝 | PASSED | 10350 ms |
| 15 | 自由物料 LINK_EXISTING 审核 | PASSED | 14735 ms |
| 16 | 自由物料 CREATE 审核 | PASSED | 14499 ms |
| 17 | 自由物料 REJECT 驳回 | PASSED | 9274 ms |
| 18 | 多工单分别保存请求与检验关联 | PASSED | 10703 ms |
| 19 | 不存在工单拒绝且数据不变 | PASSED | 4703 ms |
| 20 | 台位 ALL 持久化与漏选拦截 | PASSED | 10644 ms |
| 21 | 台位 PARTIAL 持久化与详情回读 | PASSED | 10631 ms |
| 22 | 台位越界服务端拒绝且不建单 | PASSED | 4403 ms |
| 23 | 桌面匿名公开入口与私有派工拒绝 | PASSED | 9258 ms |
| 24 | 独立手工进货检验记录与开关禁用 | PASSED | 6644 ms |
| 25 | 计量器具台账登记、编辑、软删除与重复/日期拒绝 | PASSED | 7056 ms |
| 26 | 计量借还两阶段状态机与确认归还 | PASSED | 10805 ms |
| 27 | 计量停用/超期禁用与非法参数拒绝 | PASSED | 8755 ms |
| 28 | 计量只读与异部门权限边界 | PASSED | 5951 ms |
| 29 | 计量检定计划闭环与日期校验 | PASSED | 8595 ms |
| 30 | 计量弱网重试与并发写安全 | PASSED | 7274 ms |
| 31 | 监督项目登记、编辑、重开与软删除 | PASSED | 7801 ms |
| 32 | 监督计划任务与日报完成项目 | PASSED | 9384 ms |
| 33 | 监督整改、验证与关闭历史 | PASSED | 13993 ms |
| 34 | 监督创建者范围与只读角色拒绝 | PASSED | 11210 ms |
| 35 | 监督终态非法操作拒绝 | PASSED | 10393 ms |
| 36 | 监督丢响应重试与并发幂等 | PASSED | 16408 ms |

## 监督批次发现并修复的真实缺陷

### BUG-5：监督写权限拒绝被转换为500

- 复现：`0992baaa7e5b0f02c83676d3` 监督5通过1失败，异部门写被404正确拒绝后，只读角色 PUT 项目原断言期望403、实收500；`supervision-denial-403.json`显示“无权限执行此操作，请联系管理员”，`api.log`显示该PUT进入全局 NitroErrorHandler。不是UI定位故障，也不是越权写成功。
- 根因与影响：`authorizeWrite`在监督写路由的try/catch之外抛出BusinessError，落入通用500转换；本批前已存在。造成拒绝响应错误、客户端误报系统异常。创建者范围规则仍有效，不改成部门隔离、不放宽鉴权。
- 本批修复：`apps/backend/api/qms/supervision/`下15个写handler将授权纳入标准错误边界，透传业务403/404/409；委托handler在try内await，以捕获异步失败。覆盖项目、任务（新增/修改/删除/排序/导入）、问题/处理记录及日报。处理记录handler的解析及附件登记移到`apps/backend/modules/supervision/supervision-issue-action-create.post.service.ts`以满足薄路由规则；不是业务流程重构。
- 单测：新增`apps/backend/api/qms/supervision/projects/index.post.test.ts`表驱动验证15个handler授权拒绝标准转换；不触发写操作。真实E2E同时验证UI编辑保存被拒、抽屉保留，随后补充直接请求项目修改/删除、任务修改、问题修改及日报创建；每次数据库快照不变。
- 复验：`1d1733451378de0736085b6c`权限定向PASS（该轮重试仍失败）；`5e1f272ac1d54f7d13a44417`两例PASS；监督完整6例和最终36例权限用例均PASS。状态：**已修复并真实复验**。当前监督页面仍可显示编辑操作，本次验收证明保存被拒及数据不变，不宣称所有按钮级隐藏已覆盖。

### BUG-6：丢响应后超过短时窗口重试重复处理记录

- 复现：`1d1733451378de0736085b6c`定向1通过1失败，服务端第一次真实处理已提交后浏览器丢响应；立即重试被3秒防重拒绝，但延迟后同一UI再次保存，`supervision-delayed-retry-*.json`出现两条相同内容FOLLOW_UP，原数量断言1实际2。两次真实写入间隔超过3秒。本批前已存在，不把`0992...`的短时重试PASS当幂等验收。
- 根因与影响：处理抽屉/API没有稳定的业务请求键；服务只依赖全局3秒防重且允许状态不变的合法跟进，窗口后重新创建处理记录并刷新状态时间。影响弱网重试和历史记录唯一性，不能靠禁止所有相同内容跟进修复。
- 本批修复文件：`apps/web-antd/src/views/qms/supervision/components/SupervisionManagementView.vue`每次打开处理表单生成新UUID，失败时保留；`apps/web-antd/src/api/qms/supervision.ts`传递Idempotency-Key；新处理记录委托handler校验可选请求键；`apps/backend/modules/supervision/supervision-issue.service.ts`复用现有`~/modules/idempotency`，claim、记录新增和状态CAS在同一事务中提交/回滚，5分钟内同键同payload返回原ID，同键不同payload409，重放重新检查创建者及未删除状态。
- 未延长全局3秒窗口、未吞异常、未放宽原409/数量/数据不变断言；新增的延迟重试要求200及原ID。每次新表单产生新键，允许相同payload新增合法后续跟进。未带键的既有调用兼容旧行为，不宣称得到同等幂等保证；超过5分钟、关闭/重开/刷新表单后的意图恢复不在本次承诺范围。
- 局部单测：`supervision-issue.service.test.ts`新增原结果重放不启动第二次业务事务、当前所有权重检、使用claim提供的事务和CAS失败传播；现有idempotency单测覆盖fingerprint冲突、回滚、竞争claim和过期。单测mock DB，与真实隔离E2E分工明确。
- 最终第36例保留原立即重试409；等待超过3秒后UI返回原ID、三次发送同一键、完整数据库快照不变；同键更改payload返回`IDEMPOTENCY_KEY_REUSED`/409且不变；再次打开表单，相同payload使用新键，新增一条合法跟进。另一个UI提交的真实请求通过两次`route.fetch`并发发送，使用不同query避开短时防重、触发数据库唯一claim，两次真实200返回同一ID、恰一条记录；并发非法终态写均409、数据不变。只转发真实后端响应，不伪造业务成功。
- 复验：`5e1f272ac1d54f7d13a44417`定向2/2；`22565b00105e378e5c594863`完整6/6（包含合法新跟进和payload冲突）；最终`37b01b257103fc291bb42fed`联合36/36。状态：**已修复并真实复验**。一次两路竞争不等于穷举压力或跨进程并发验收。

### 既有BUG-1至BUG-4的当前回归

| 缺陷 | 已完成修复 | 本次联合复验 |
| --- | --- | --- |
| BUG-1 不存在工单抛原生Error导致500 | 规范客户端BusinessError/400，不新建单和关联 | 第19例PASS，原拒绝/数据不变断言保留 |
| BUG-2 台位超工单数量仍可建单 | 共享创建校验，公共/私有入口拒绝越界，合法ALL/PARTIAL不受影响 | 第20/21/22例PASS |
| BUG-3 售后Prisma更新校验及权限500 | 保留合法空字符串/拒绝非法工单，授权纳入标准错误转换 | 第1至4例PASS，200/403/404/400/409及费用/身份/版本/幂等断言保留 |
| BUG-4 借用中单删/批删未保护 | 事务前置状态检查 + CAS/active借用保护，混合批次原子拒绝 | 第26/30例PASS，原409及数据不变/竞争不变量保留 |

以上前四项修复归属此前批次，详细复现/文件/历史证据保留在下方，不作为本批新增成果。未实施与测试缺陷无关的大规模业务整改。

## 监督运行历史（通过/失败/跳过）

| Run | 实际命令 | 通过/失败/跳过 | 退出码 | 总生命周期 | 证据意义 |
| --- | --- | --- | --- | --- | --- |
| `11a5e836819aa8ffc9d0582d` | `QGS_E2E_SCOPE=supervision-project pnpm test:e2e` | 0/1/0 | 1 | 42,513 ms | 登录已通；保存按钮空格定位失败，测试适配 |
| `28c2261eae6c80b41ee6123a` | `QGS_E2E_SCOPE=supervision-project pnpm test:e2e` | 1/0/0 | 0 | 32,574 ms | 项目公共helper 1/1通过 |
| `a5ba036bd6a7d4e5e1e8ca71` | `QGS_E2E_SCOPE=supervision pnpm test:e2e` | 1/5/0 | 1 | 89,879 ms | Decimal及英文状态选项适配失败；不是业务BUG |
| `0992baaa7e5b0f02c83676d3` | `QGS_E2E_SCOPE=supervision pnpm test:e2e` | 5/1/0 | 1 | 77,943 ms | BUG-5：权限预期403实际500；当时短时重试通过不证明幂等 |
| `1d1733451378de0736085b6c` | `QGS_E2E_SCOPE=supervision-risk pnpm test:e2e` | 1/1/0 | 1 | 45,674 ms | 权限已通；BUG-6：超过3秒后两条FOLLOW_UP |
| `5e1f272ac1d54f7d13a44417` | `QGS_E2E_SCOPE=supervision-risk pnpm test:e2e` | 2/0/0 | 0 | 48,595 ms | 权限及延迟重试/并发定向通过；后补合法新跟进/冲突边界 |
| `22565b00105e378e5c594863` | `QGS_E2E_SCOPE=supervision pnpm test:e2e` | 6/0/0 | 0 | 91,063 ms | 6/6通过；之后仅公开导出import路径与指纹依赖清单修正 |
| `37b01b257103fc291bb42fed` | `pnpm test:e2e` | 36/0/0 | 0 | 371,071 ms | 最终冻结源码联合验收 |

沙箱第一次`7ecacc5b3feca5a9f2cc283d`启动被`Operation not permitted`阻断，无测试执行/无专属资源创建，不统计为通过或skip；按既有授权在允许原生容器的执行权限下完成后续运行。所有真正启动的本批环境在run.json有4条清理记录。`22565...`与最终运行是不同runId/独立库；本批未机械重复旧负向实验。

## 门禁、修改归属及产物

- `rtk vitest run apps/backend/modules/supervision/ apps/backend/api/qms/supervision/projects/index.post.test.ts apps/backend/modules/idempotency/ scripts/e2e/safety.test.mjs --reporter=json --outputFile=output/playwright/supervision-checks/unit-results-final.json`：退出0，**134/134通过、0失败、0跳过**，最终记录3207 ms。
- 后端`pnpm --dir apps/backend exec tsc --noEmit`退出0（最终10470 ms）；Web `pnpm --dir apps/web-antd run typecheck`退出0；本批相关ESLint退出0。
- `pnpm check:qms-arch`最终退出0、0 violations；存量baseline提示没有扩大。初次新增处理handler超过路由行数及跨模块内部import门禁失败已修正：拆出同模块委托handler、从file-storage公开index导出引用。初次lint的测试await-member、导入排序等失败已修正，初始日志保留。
- 本批文件：`apps/web-antd/e2e/supervision.spec.ts`；此前本批准备已加入的seed权限/零计数；`scripts/e2e/run.mjs`的36/6/1/2数量守卫与监督/幂等源码指纹；上文15个API、两个监督service及相关单测；Web监督API/处理抽屉；监督ARCHITECTURE；`docs/testing.md`、本报告/矩阵及CHANGELOG/PROJECT_STATE的必要未提交记录。已有其他dirty文件全部保留，不全部认领。
- 静态门禁命令/退出码/实测记录：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/supervision-checks/checks.json`；单测JSON `unit-results-final.json`，日志`unit-final.log`、`backend-type-final.log`、`web-type.log`、`eslint.log`及最后公开导出/指纹清单修正的`eslint-final.log`、`architecture-final.log`（均同目录）；初始架构/格式错误单独保留，不冒充最终成功。
- 最终结果JSON：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/37b01b257103fc291bb42fed/report.json`；HTML：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/37b01b257103fc291bb42fed/report.html`；源码/环境/命令/清理：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/37b01b257103fc291bb42fed/run.json`；前置与初始零数据：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/37b01b257103fc291bb42fed/seed.json`；独立收尾核验：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/37b01b257103fc291bb42fed/closeout-audit.json`。
- 脱敏日志：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/37b01b257103fc291bb42fed/api.log`、`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/37b01b257103fc291bb42fed/web.log`、`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/37b01b257103fc291bb42fed/playwright.log`。截图37张完整路径列于closeout-audit.json，包含6张`supervision-passed-*.png`与既有模块/登录截图；191个业务快照完整路径也列于该审计，监督文件为`supervision-*.json`。
- 原始trace/video未生成：配置关闭，避免保存密码、cookie及token；不虚构trace路径。用遮盖输入框截图、脱敏日志、真实数据库快照及哈希交付。

## 资源隔离、清理及验收边界

- 实际环境：darwin/arm64，Node v22.22.3，Apple container CLI1.0.0（Contained），Playwright1.53.2 / Chromium138.0.7204.23，MySQL8.0.46 / Redis8.8.0；单worker、retries=0，未改依赖版本。
- 最终独立库`qgs_e2e_37b01b257103fc291bb42fed`；本轮端口MySQL64260、Redis64264、API64287、Web64288。监督定向独立库`qgs_e2e_22565b00105e378e5c594863`，与最终库不同。每轮seed与runId绑定，监督projects/reports/issues/planTasks全0；每例UI创建独立记录并核验自身ID/计数，worker重启不清空前例业务，不依赖前例成功。
- 继续沿用isolated/test、loopback、动态账号/端口、owner现场检查和各迁移/seed前校验；不读取.env、私钥或输出凭据。只执行当前schema自动基线迁移，不证明历史迁移升级链可重放。
- run.json及独立closeout-audit均确认：专属MySQL/Redis容器不存在、临时目录删除、3个长期子进程退出、4端口实探ECONNREFUSED；新建命名卷0，容器/卷清单与运行前一致。没有清理别人的资源，没有新的常驻dev/start/serve。
- 监督真实入口为`/qms/supervision`五个tab：监造项目、甘特计划、现场日报、问题闭环、纳期管控。完成的6例覆盖前四者核心链路，按当前OPEN/IN_PROGRESS/VERIFYING/CLOSED以及项目/任务派生状态，不虚构审批/独立验收功能。模块无部门读隔离，创建者写权限和RBAC是实际安全边界。
- 剩余桌面模块（本节为监督批次快照，供应商与质量损失已在后续批次验收）：整车调试等；监督Excel导入/覆盖、排序与父子多任务、纳期看板、附件上传/图像导出、日报编辑删除及更多问题类型仍待补；计量导入导出/到期通知等原缺口继续跟踪。移动/微信端明确排除，不是本批阻塞。其他浏览器、生产发布/性能、历史迁移、所有并发调度与跨进程压力未验证。后续桌面批次已授权，本批不称全系统完成。

---

## 历史：上一计量批次30例及更早交付记录

以下“当前/最终”均指当时快照，不能替代上方36例最终源码证据。

### 上一计量交付报告（历史快照）

验收日期：2026-10-09。**上一计量快照联合运行 30/30 PASS、0 失败、0 跳过，根命令退出码 0。** Run `a40ef511d8a3dff2a9cbbceb`，实测总生命周期 **302,406 ms**。覆盖报检（含鉴权）20 例、售后4例、计量6例。仅桌面 Ant Design Web，移动 H5/微信端排除；监督、供应商治理、质量损失、整车调试等桌面模块仍未完成，不称全系统覆盖。步骤、拒绝与持久化断言见 [覆盖矩阵](web-e2e-business-coverage.md)。

## 历史计量交付：命令、版本与完整用例清单

- 实际执行：仓库根 `pnpm test:e2e` → Web 包入口 → 原生 container 专属 MySQL/Redis → 真实 Nitro/Vite/Chromium → Playwright；不是只收集用例。数量守卫为30，无 skip/expected-failure 或业务成功响应 mock。
- 开始 `2026-10-09T03:51:29.461Z`，结束 `2026-10-09T03:56:31.867Z`；302,406 ms 含建环境、构建、用例和清理。下表用例耗时来自 report.json，不与总生命周期混淆。
- 基线 HEAD `3659414212510f09cc63f3ac856d6ec6dbe6135e`，保留当前 dirty；无提交、推送、合并、部署、CI 或分支保护修改。
- 当前逐一计算 `sourceFiles` 共 **145** 文件 SHA256，差异 **0**。聚合哈希 `25af7fb8135b1370f4693ad0f5b20d437b218a3cd4c5307226ee5297e85e6ea3`。此前报告收尾误写69，应以实际 run.json 的145为准；不是全仓指纹。
- 最终报告补写未改被测源码；文档 E2E 如实复用同一交付的本次运行。历史24例结果不作为本次计量修改后的全绿证据。

| 序号 | 完整覆盖清单 | 结果 | Playwright 实测耗时 |
| --- | --- | --- | --- |
| 1 | 售后 UI 登记、处理完成、详情回读与软删除 | PASSED | 16585 ms |
| 2 | 售后部门与角色隔离 | PASSED | 9526 ms |
| 3 | 售后分类错误、旧版本及缺版本拒绝 | PASSED | 10414 ms |
| 4 | 售后网络失败后重试与幂等键冲突 | PASSED | 10729 ms |
| 5 | 错误密码登录被拒 | PASSED | 1393 ms |
| 6 | 登录、退出与受保护页面阻断 | PASSED | 5394 ms |
| 7 | UI 创建报检单并重开详情 | PASSED | 6181 ms |
| 8 | 过程报检派 QC 并关单（丢响应重试） | PASSED | 12834 ms |
| 9 | 不合格关联、处置保存与复检关单 | PASSED | 14936 ms |
| 10 | 进货报检保留供应商身份 | PASSED | 9945 ms |
| 11 | 部门与角色边界拒绝且数据不变 | PASSED | 10439 ms |
| 12 | 重复提交与丢响应重试只建一单 | PASSED | 7598 ms |
| 13 | 外协过程进货关单与供应商类别拒绝 | PASSED | 9785 ms |
| 14 | 外协进货关单与供应商类别拒绝 | PASSED | 9992 ms |
| 15 | 自由物料 LINK_EXISTING 审核 | PASSED | 14564 ms |
| 16 | 自由物料 CREATE 审核 | PASSED | 14432 ms |
| 17 | 自由物料 REJECT 驳回 | PASSED | 9540 ms |
| 18 | 多工单分别保存请求与检验关联 | PASSED | 10533 ms |
| 19 | 不存在工单拒绝且数据不变 | PASSED | 4842 ms |
| 20 | 台位 ALL 持久化与漏选拦截 | PASSED | 10558 ms |
| 21 | 台位 PARTIAL 持久化与详情回读 | PASSED | 10466 ms |
| 22 | 台位越界服务端拒绝且不建单 | PASSED | 4286 ms |
| 23 | 桌面匿名公开入口与私有派工拒绝 | PASSED | 9519 ms |
| 24 | 独立手工进货检验记录与开关禁用 | PASSED | 7399 ms |
| 25 | 计量器具台账登记、编辑、软删除与重复/日期拒绝 | PASSED | 6419 ms |
| 26 | 计量借还两阶段状态机与确认归还 | PASSED | 9153 ms |
| 27 | 计量停用/超期禁用与非法参数拒绝 | PASSED | 8633 ms |
| 28 | 计量只读与异部门权限边界 | PASSED | 5918 ms |
| 29 | 计量检定计划闭环与日期校验 | PASSED | 7907 ms |
| 30 | 计量弱网重试与并发写安全 | PASSED | 7527 ms |

## 四项真实 BUG：修复与前后证据

| BUG | 根因、影响及最小修复文件 | 前后实测与当前状态 |
| --- | --- | --- |
| BUG-1 不存在工单返回500 | work-orders 用原生 Error 抛非法工单，异常转换失败；改 `apps/backend/modules/inspection/inspection-request-work-orders.ts` 为 BusinessError/400，补相邻单测 | 历史 `421b56574c62df083d3dc093` 原客户端错误断言失败；最终第19例 PASS，拒绝且不新增数据；已修复并复验 |
| BUG-2 台位越界仍建单 | 把容错读取 normalization 用于写入，越界台号被夹到上限；`inspection-request-station-validation.ts` 强写校验，`inspection-request-create-payload.ts` / `inspection-request-create.service.ts` 传工单上限及必选语义，补单测 | 原3台提交4接口200且计数增加；历史分支运行失败；最终ALL/PARTIAL及第22例原拒绝断言 PASS；公开/私有共享创建校验，历史读取不改；已修复并复验 |
| BUG-3 售后更新校验与权限500 | payload 将必填 projectName 空值变null触发Prisma校验，授权异常在错误边界外；改 `apps/backend/modules/after-sales/after-sales-payload.ts` 保留合法空字符串、拒绝空工单；`apps/backend/api/qms/after-sales/[id].put.ts` / `[id].delete.ts` 纳入标准错误转换，补payload与handler单测 | `a0b706d58fc0d2086b594bac` 1通过3失败，合法保存500/无权限500；最终4售后例 PASS，200/403/404/400/409、版本/身份/费用/幂等断言保留；已修复并复验 |
| BUG-4 借用中的计量器具可删除 | 单删和批删只写isDeleted，未检查borrowStatus及active借用记录，能删除借用中资源；修复详见下节 | `54f4ce91f03ffee97449934a` 删除预期409实际200；定向 `2741cf2ec3093cdb3a827651` 原断言通过；最终第26/30例通过；已修复并复验 |

### BUG-4：状态校验、原子拒绝与并发保护

- 复现与影响：真实 UI 登记并借出器具后，单删返回200而非409，器具被软删、active借用记录仍存在。混合批次还可能删掉合法可用成员，破坏借还资源不变量。约束依据是 metrology ARCHITECTURE 的“借用中的器具不可删除”及 CONSTRAINTS 的事务/CAS要求，不增设审批规则。
- 根因：旧 `MetrologyService.deleteById` / `batchDelete` 直接 update/updateMany，缺少业务状态守卫；不能仅先查后删。
- 修复：新增 `apps/backend/modules/metrology/metrology-delete.service.ts`，由 `metrology.service.ts` 委托。事务内查询未软删器具，`BORROWED` / `RETURN_PENDING` 先返回BusinessError/409；写入 updateMany 同时要求 `isDeleted=false`、`borrowStatus=AVAILABLE`、不存在 `BORROWED/OVERDUE/RETURN_PENDING` 的未删active记录。写入count必须等于查到的成员数，否则在同事务抛409，回滚已经命中的成员。与借出CAS争抢同一器具行，避免检查后并发借出绕过。
- 路由修复：`apps/backend/api/qms/metrology/[id].delete.ts` 与 `batch-delete.post.ts` 透传BusinessError的HTTP状态；拒绝时不走成功审计。合法AVAILABLE器具仍能删除；单删不存在返回404；批次保留旧有缺失ID/重复ID计数语义，不新增无依据的批次规则。
- 局部单测：`metrology-delete.service.test.ts` 验证单删BORROWED/RETURN_PENDING拒绝、混合批次两种忙碌态拒绝、单/批CAS竞争count=0、部分批次count不足抛错、合法单/批删除、去重和缺失ID；`metrology.service.test.ts` 验证委托；原 `metrology-adversarial.test.ts` 适配真实事务mock和原子where。单测为mock DB，不能代替真实并发数据库验收。
- 最终E2E：第26例保留原删除409及完整状态不变断言，同时核验混合批次的可用成员不变；第30例并发删除/借出核验胜出路径：借出成功则删除409、保留器具且恰一条借用记录；删除成功则借出在读取前400或CAS阶段409，器具软删且借用数0。竞争409额外核验现有响应 `code=-1` / `error.code=CONFLICT` 与具体message，未放宽成任意非200。
- 状态：**已修复、已真实复验**。待确认归还删除拒绝由单测覆盖；本次混合批次真实E2E使用BORROWED。一次真实竞争不等于穷举所有线程调度/跨进程竞争，未声称压力验收。

## 计量相邻修正与测试交互修正的归属

| 修改 | 根因与影响 | 验证及边界 |
| --- | --- | --- |
| module-loader.ts / module-loader.test.ts 计量菜单父节点保护 | legacy leaf path命中自己的catalog，可能把父节点改成自己的子节点、丢路由子树；过滤parentId候选 | 菜单单测及6个真实路由场景；与早期同进程初始化Promise修正分别记录，不外扩多进程重构 |
| 台账/借还/检定计划 index.vue 写按钮及私有写路由错误边界 | canWrite OR canList使只读用户看到写入口；授权在try外导致拒绝异常落入全局错误 | 只读/异部门列表可读但无写入口，真实写403且数据不变；共享台账不虚构部门私有dataScope |
| calibration-plan/instrument-options.ts 及相邻单测 | 创建计划原需调用器具导出端点，附带不必要的导出权限且可能截断候选；改分页读取台账 | 无Export授权的实际计划UI闭环，分页及无进展异常单测；不放宽服务端权限 |
| metrology-status.ts / status.test.ts 与 calibration-plan-mapping.ts | 业务日期本地午夜被toISOString切片转成前一UTC日，编辑回读可能漂移；本地年月日格式化 | 本地日期回环单测、台账回读与计划实际日期落库E2E；当前Asia/Shanghai环境，未验证其他时区 |
| metrology.spec.ts 新增按钮、月份、全局提醒handler | 真实按钮是“新增”；月份是数字虚拟列表；联合套件前例留下真实待派单弹窗遮挡点击 | 按真实UI键盘选择12，核验落库12；沿用相邻spec点击“标记已读”handler，不mock提醒、不清空业务记录；错误定位属于测试缺陷，不当作服务端BUG |

临时为竞争断言改公共 BusinessError 顶层响应格式的尝试已撤回；最终公共响应助手未改，原有 `error.code` 格式保持。对应中间6/6仅历史证据，不作为最终源码验收。未实施无关或大规模业务重构。

## 运行历史与失败定位保留

| Run | 实际根命令 | 通过/失败/跳过 | 退出码 | 总生命周期实测 | 用途 |
| --- | --- | --- | --- | --- | --- |
| `54f4ce91f03ffee97449934a` | `QGS_E2E_SCOPE=metrology pnpm test:e2e` | 4/2/0 | 1 | 77,973 ms | 修复前：借用中删除200、月份定位失败 |
| `0dccc91285a4997b06a6398e` | `QGS_E2E_SCOPE=metrology-risk pnpm test:e2e` | 1/1/0 | 1 | 57,965 ms | 删除保护通过；月份虚拟列表定位失败 |
| `2741cf2ec3093cdb3a827651` | `QGS_E2E_SCOPE=metrology-risk pnpm test:e2e` | 2/0/0 | 0 | 43,722 ms | 删除保护及月份交互定向通过 |
| `ddc2d20cbf7ff14ecd862217` | `QGS_E2E_SCOPE=metrology pnpm test:e2e` | 5/1/0 | 1 | 71,726 ms | 竞争测试错误固定预期400，实际合法CAS拒绝409 |
| `ccdcba5d0a8632e16376a58d` | `QGS_E2E_SCOPE=metrology pnpm test:e2e` | 5/1/0 | 1 | 69,540 ms | 竞争测试误读错误码位置；真实数据安全 |
| `99cb1b63b622d105166d1356` | `QGS_E2E_SCOPE=metrology pnpm test:e2e` | 6/0/0 | 0 | 66,876 ms | 中间6/6；曾含公共响应格式改动，已撤回，不代表最终源码 |
| `4f5a48e756da13ca5f2c3e2f` | `pnpm test:e2e` | 24/6/0 | 1 | 359,618 ms | 计量被真实全局待派单提醒遮挡；报检售后24通过 |
| `02ded779b96b16a72772b576` | `pnpm test:e2e` | 30/0/0 | 0 | 307,217 ms | 联合30通过；快照后两处仅导入排版变化，历史证据 |
| `a40ef511d8a3dff2a9cbbceb` | `pnpm test:e2e` | 30/0/0 | 0 | 302,406 ms | 最终冻结源码联合验收 |

最终源码稳定后30例全部通过；前两次竞争测试失败分别是错误固定400、错误码位置误读，并非数据库保护失败。全局提醒失败由真实页面截图/调用日志定位，未改产品按钮label或业务响应。未重复旧负向对照；原8例失败捕获证据在下方历史记录。

## 门禁、修改归属与完整产物路径

- 当前相称门禁：`rtk vitest run apps/backend/modules/metrology/ apps/backend/utils/module-loader.test.ts scripts/e2e/safety.test.mjs apps/web-antd/src/views/qms/metrology/calibration-plan/instrument-options.test.ts apps/backend/api/qms/metrology/index.post.test.ts --reporter=json --outputFile=output/playwright/metrology-checks/unit-results.json`，退出0，**261通过/0失败/0跳过**；后端 `tsc --noEmit`、Web `typecheck`、相关文件ESLint均退出0。
- `pnpm check:qms-arch` 退出0、0 violations。baseline提示为存量项，未扩大baseline。先前门禁中的本批旧删除mock、未用变量、导入排序/PrismaPromise mock类型失败已修正，原失败记录保留。
- 门禁详细命令、退出码与实测耗时：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/metrology-checks/checks.json`；单测结果 `unit-results.json`；最终日志 `unit-final.log`、`architecture.log`、`backend-type-final.log`、`web-type.log`、`eslint-final.log`。`checks-initial.json` 和旧日志是修正前证据。
- 本计量批次文件：`apps/web-antd/e2e/metrology.spec.ts`；`apps/backend/scripts/e2e-seed.ts`；`scripts/e2e/run.mjs`；上文delete/status/service及其单测、menu-loader和单测、计量三个index.vue、借用EntryPanel/中英文label、instrument-options和单测；计量写API及index.post.test.ts；`docs/testing.md` 与两份统一报告。早期报检/售后dirty文件归属见历史节，不全部认领为本轮新增。本轮最终收尾只改报告，保护其他dirty。
- 最终结果：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/a40ef511d8a3dff2a9cbbceb/report.json`；HTML报告：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/a40ef511d8a3dff2a9cbbceb/report.html`；运行/源码/清理：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/a40ef511d8a3dff2a9cbbceb/run.json`；前置及零业务证据：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/a40ef511d8a3dff2a9cbbceb/seed.json`。
- 脱敏日志完整路径：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/a40ef511d8a3dff2a9cbbceb/api.log`、`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/a40ef511d8a3dff2a9cbbceb/web.log`、`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/a40ef511d8a3dff2a9cbbceb/playwright.log`。
- 截图完整文件列表及业务快照路径：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/a40ef511d8a3dff2a9cbbceb/closeout-audit.json`；同目录 `metrology-passed-*.png`、`passed-*.png`、`login-rejected.png`、`login-success.png`、`logged-out.png`、`request-reopened.png`；`metrology-*.json` / `state-*.json` / `branch-*.json` / `after-sales-*.json` 为实际只读业务证据。
- trace/video未生成：配置禁用，避免保存登录密码/cookie/token。不虚构trace路径；用遮盖输入框截图、脱敏日志及业务快照交付。

## 环境、隔离、清理与未验证范围

- 实际环境darwin/arm64，Node v22.22.3，Apple container CLI 1.0.0（Contained），Playwright1.53.2/Chromium138.0.7204.23，MySQL8.0.46/Redis8.8.0；单worker、retries=0。无需Docker，没有启动持久dev服务。
- 最终库 `qgs_e2e_a40ef511d8a3dff2a9cbbceb`，MySQL/Redis/API/Web分别61600/61604/61639/61640。显式isolated/test、仅loopback、专属端口/数据库/动态账号、owner label与现场归属检查后迁移seed；未读取.env或秘密文件、无硬编码凭据。
- seed与本runId绑定，报检/售后计数0，计量instruments/borrows/plans均0。worker重启只校验本runId seed证据；不删除前例业务、不借旧seed证明零数据；每例自身ID及新增/拒绝计数独立核验。
- 四条cleanup记录：两专属容器已删除、临时目录删除、进程全部退出、ownedContainersAbsent=true、namedVolumesCreated=0、四端口关闭。resourcesBefore/After仅原有ut-postgres，volumesBefore/After仅原有qms-container-mysql-data与qms-container-redis-data，未改/停原有资源。对应证据见run.json及closeout-audit.json。
- 独立运行使用不同runId与数据库；中间定向与联合运行的seed均从独立空业务库初始化，但版本有差异，不宣称最终30例已经两轮完全相同源码重复。最终run精确覆盖当前145文件，后续只补文档。
- 剩余桌面模块：监督、供应商独立治理、质量损失独立闭环、整车调试等；继续既有授权分批覆盖，无需重新授权，但不纳入本计量批次通过统计。计量导入/导出、到期通知、所有浏览器/时区、跨进程高并发压力未验收；不虚构审批或检定后自动更新台账有效期。
- 移动H5/微信端排除；不接CI、不做生产部署/真实业务库写入。当前schema生成临时migration baseline验证业务，不证明历史迁移链或生产升级成功。

---

# 历史交付：报检与售后24例（以下为旧快照）

下文保留 `6243799bdb985c9300cf0b36` 交付的原始报告、三BUG修复证据及较早修改归属。下文出现“本批/当前/最终”均指该历史24例快照，不能证明本次计量修改后的源码；当前结论、145文件指纹与30例结果以上文为准。

## 历史24例报告正文

验收日期：2026-10-09。**本批完成：最终联合套件 24/24 PASS、0 失败、0 跳过，根命令退出码 0。** 覆盖登录鉴权、报检核心及剩余分支、售后四场景；不能称全系统业务全覆盖。详细步骤、终态和持久化断言见 [覆盖矩阵](web-e2e-business-coverage.md)。

## 1. 基线与授权边界

- HEAD/提交基线：`3659414212510f09cc63f3ac856d6ec6dbe6135e`，分支 `main`；保护既有 dirty 改动，无暂存、提交、推送、合并、部署、分支保护或 CI 调整。
- 桌面 Ant Design Web；移动 H5、微信端排除。有限生命周期隔离测试服务获授权；真实业务库与原有常驻服务不动。
- 所有用例使用真实前端、后端、MySQL/Redis；seed 仅前置数据，无业务成功响应 mock、无 expected-failure、无静默 skip。
- 本轮收尾仅修改本报告、覆盖矩阵及历史文档指引；前面的代码修改归属按下文列出，不将全部 dirty 文件自动认领为本轮新增。

## 2. 实际命令与结果

| 运行 | 实际命令 | 通过/失败/跳过 | 退出码 | 总生命周期实测耗时 | 证据用途 |
| --- | --- | --- | --- | --- | --- |
| `421b56574c62df083d3dc093` | `QGS_E2E_SCOPE=inspection-branches pnpm test:e2e` | 10/2/0 | 1 | 172,174 ms | 修复前非法工单与越界台位真实失败，历史快照 |
| `904248b92016a3ce3053b705` | `pnpm test:e2e`（当时全套为20例） | 20/0/0 | 0 | 210,340 ms | 首次报检修复复验，之后源码有变化，只证明当时版本 |
| `a0b706d58fc0d2086b594bac` | `QGS_E2E_SCOPE=after-sales pnpm test:e2e` | 1/3/0 | 1 | 65,856 ms | 售后更新/权限 500 复现；重试通过 |
| `a80f85e1d8824aa1b67d54ef` | `QGS_E2E_SCOPE=after-sales pnpm test:e2e` | 4/0/0 | 0 | 71,929 ms | 售后定向修复复验，随后统一快照由下一行覆盖 |
| `6243799bdb985c9300cf0b36` | `pnpm test:e2e` | **24/0/0** | **0** | **260,160 ms** | 当前最终源码联合验收 |

耗时取各 `run.json.durationMs`，包含建环境、构建、执行和清理，不是估算。最终开始 `2026-10-09T02:33:59.648Z`，结束 `2026-10-09T02:38:19.808Z`。Playwright 命令真实执行规格，`report.json.tests` 逐项为 passed，globalErrors 为空；非 collect-only 或空跑。统计分组为既有鉴权/核心 8 + 报检分支 12 + 售后 4；早期口头“3 鉴权”不准确，第三例是 UI 创建及回读。

### 最终通过用例完整列表

1. PASS — `after-sales UI registration completes with canonical identities, costs, reopened details and soft deletion`
2. PASS — `after-sales department and role denials preserve data and match desktop controls`
3. PASS — `after-sales classification mismatch and stale edits are rejected without overwriting saved UI changes`
4. PASS — `after-sales lost response and UI retry reuse one create and reject a changed payload`
5. PASS — `rejects an incorrect password through the login UI`
6. PASS — `logs in, logs out and blocks reopening the protected page`
7. PASS — `creates a request through UI and reopens persisted details after reload`
8. PASS — `process request dispatches to QC and closes with real inspection records despite a lost response`
9. PASS — `failed inspection links an issue, saves disposition and closes after QC reinspection`
10. PASS — `incoming request preserves supplier identity through UI dispatch and acceptance`
11. PASS — `department and role boundaries reject foreign reads and writes without changing persisted data`
12. PASS — `double submission and retry after a committed response loss create only one request`
13. PASS — `outsourcing process accepts through UI and rejects a supplier category mismatch`
14. PASS — `outsourcing incoming accepts through UI and rejects a supplier category mismatch`
15. PASS — `free material LINK_EXISTING reviews through UI and preserves canonical state under rejected writes`
16. PASS — `free material CREATE reviews through UI and preserves canonical state under rejected writes`
17. PASS — `free material REJECT reviews through UI and preserves canonical state under rejected writes`
18. PASS — `multiple incoming work orders persist separate request and inspection links through UI acceptance`
19. PASS — `multiple incoming work orders reject a nonexistent order with a client error and unchanged data`
20. PASS — `station ALL persists through UI close and blocks omitted stations in UI`
21. PASS — `station PARTIAL persists through UI close and blocks omitted stations in UI`
22. PASS — `server rejects an out-of-range station without creating or changing a request`
23. PASS — `anonymous desktop public entry creates a receipt without identity and denies private dispatch`
24. PASS — `manual incoming inspection creates through UI and disabled setting prevents further records`

## 3. 三项实际 BUG 登记：均已修复并复验

### BUG-1：不存在工单返回 500

- 复现：多工单创建包含不存在工单；历史 run `421b56574c62df083d3dc093` 原断言预期客户端错误、实际 500。
- 根因：`assertWorkOrdersExist` 抛带 BAD_REQUEST 前缀的原生 Error，未按 BusinessError 契约转换。影响非法工单请求的错误码与前端反馈；应拒绝且不落库。
- 最小修复：`apps/backend/modules/inspection/inspection-request-work-orders.ts` 改用规范 BusinessError/400；相邻 `inspection-request-work-orders.test.ts` 验证。
- 复验：报检历史 20/20 与最终 24/24 中原“不存在工单 + 数据不变”用例均 PASS，不放宽 `<500` 预期。已修复。

### BUG-2：非法台位被静默截断并创建报检

- 复现：3 台工单提交台号 4，历史接口 200、创建计数增加；原拒绝与计数不变断言真实失败。
- 根因：写入复用了容错读取 normalization，把越界台号夹到合法边界，缺少强写校验。影响私有与公开共享创建入口，可能报检错误台位。
- 最小修复：新增 `apps/backend/modules/inspection/inspection-request-station-validation.ts` 及相邻单测；`inspection-request-create-payload.ts` 写前校验；`inspection-request-create.service.ts` 传递工单数量及多台位必选条件。
- 规则：需要台位选择的多台位工单禁止遗漏；ALL 不同时带部分台号；PARTIAL 非空、整数且在 1..上限内。公开/私有共享写路径执行同一校验；历史读取仍沿用容错规则。
- 运行后变更说明：早期 `904248…` 之后 create.service 增加 `machineStationBound > 1 && multiStationEnabled` 条件参数，影响必选校验，故该旧结果不足证明当前代码；最终联合运行覆盖合法 ALL/PARTIAL、越界拒绝以及匿名入口。最终原越界拒绝断言与不新增数据 PASS。已修复。
- 局部风险：依赖当前工单 multiStationEnabled/数量语义；边界与空选择以局部单测补证，未声称全历史数据回放通过。

### BUG-3：售后更新校验与权限异常返回 500

- 复现：run `a0b706d58fc0d2086b594bac` 为 1/3/0；UI 编辑保存预期 200 实际 500，两例受影响；只读用户写预期 403 实际 500。防重场景已通过，日期并非这一轮根因。
- 日志：该 run 的 `api.log` 记录 PrismaClientValidationError（脱敏摘要为 unknown argument workOrderNumber）及无权限异常落入 Nitro 全局处理。日志做过脱敏，不能据摘要单独推定数据库列缺失。
- 更新根因由代码/单测确认：共享 payload builder 对空字符串字段生成 null，而售后 projectName 为必填 String；合法工单缺项目名的编辑携带空 projectName，Prisma 更新校验失败。修复 `apps/backend/modules/after-sales/after-sales-payload.ts`，保留合法空项目名为 ''，显式空工单拒绝 400，补 `after-sales-payload.test.ts`。
- 权限根因：PUT/DELETE 的 authorizeWrite 在错误转换边界外抛异常，规范拒绝未转为标准响应。修复 `apps/backend/api/qms/after-sales/[id].put.ts` 与 `[id].delete.ts`，将授权和调用纳入 try/catch，logApiError 后透传 BusinessError，否则标准内部错误；补 `[id].put.test.ts` 同时验证两个 handler 无权时不调用写服务。
- UI/测试支持：`apps/web-antd/e2e/after-sales.spec.ts` 用日期组件键盘交互（click、输入序列、Enter）取真实日期并对照落库；beforeAll 核验本 runId 与 seed 零业务计数，不因 worker 重启重新要求实时库为零。每例独立创建、计数/ID/版本核验，失败不清空前例数据。
- 复验：定向 `a80f85…` 4/4，最终 `624379…` 4/4；合法编辑 200、跨部门 404、只读权限 403、分类/缺版本 400、旧版本 409、费用/canonical IDs/日期/幂等/数据不变断言全部保留并通过。已修复。
- 局部风险：仅规范空项目名与空工单写入；不改变分类、版本、费用、部门授权规则，不进行售后状态机重构。

## 4. 后端既有修正归属与影响

以下是本次 Web E2E 长任务中较早阶段已有的 dirty 代码，不是本轮文档收尾新增。均纳入最终 sourceFiles 和核心回归，不能隐藏在“新增测试”里。

| 文件/修改 | 根因与作用 | 风险与验证 |
| --- | --- | --- |
| inspection requests/index.get.ts；inspection-request-query.service.ts 的 list access | 列表未传递 middleware dataScope，无法保证异部门数据权限；传递请求上下文并组合 request scope | 影响列表可见范围；异部门不可见、合法调度正常列表 E2E |
| inspection-request-scope.ts；query detail/close service | request 表不能套 inspections/issue 表字段 scope；按 reporterId/inspectorId/责任部门建立 request scope，缺 scope fail closed | 影响详情及关单可访问性；部门拒绝、QC 合法关单、不合格复检 E2E；无 access 的内部旧调用语义保持，未覆盖全部内部调用 |
| dispatch.post.ts | 授权在 try 外，异常落成 500；纳入标准错误处理 | 无派工权拒绝且数据不变；合法派工 E2E |
| packages/qgs-shared/src/domain-modules/qms/env.ts 及 env.test.ts | Node 22 global process accessor 未被读取，运行环境判断失效；只在 Node global 下读取 accessor | 涉及 Node/浏览器环境判定；局部单测与真实隔离启动，浏览器注入 getter 不调用 |
| apps/backend/utils/module-loader.ts 及 module-loader.test.ts | 新隔离库登录 codes/menus 并发初始化可能重复插入；同进程共享初始化 Promise | 全套登录与售后权限回归；只解决同进程并发，多进程数据库冲突仍是未验证边界 |

未实施无关或大规模业务修复，未调整生产数据、鉴权白名单或 CI。

## 5. 修改文件分组

- E2E 用例/seed/编排：`apps/web-antd/e2e/auth-and-request.spec.ts`、`business-chain.spec.ts`、`after-sales.spec.ts`、`reporter.ts`；`apps/web-antd/playwright.config.ts`；`apps/backend/scripts/e2e-seed.ts`；`scripts/e2e/`。
- BUG 修复和单测：第 3 节列出的 work-orders、station-validation、create-payload/create.service（含相邻 create.service.test.ts）、after-sales-payload、PUT/DELETE 及 PUT.test.ts。
- 较早基础设施/业务修正：第 4 节；根 package.json/turbo.json/vitest.config.ts/.gitignore，web package.json/vite.config.mts，internal/vite-config 配置/环境处理。本轮不再修改这些源文件。
- 长期规则与报告：`docs/PROJECT_GUIDE.md`、`docs/testing.md` 已记录每次修改/新增需评估、补 E2E 并实际执行，检出 BUG 最小根因修复/复验/登记；本轮收尾更新两份统一报告及 phase1 历史指引。
- 全工作区 dirty 列表不是本轮新增清单；不暂存其他改动。

## 6. 相称门禁与实际结果

门禁证据目录：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/inspection-after-sales-checks/`；准确命令与退出码见 `final-checks.json`，以下补充本轮核对结果。

| 检查 | 命令 | 退出码/结果 | 日志 |
| --- | --- | --- | --- |
| 局部单测 | `rtk vitest run apps/backend/modules/after-sales/ apps/backend/utils/module-loader.test.ts apps/backend/modules/inspection/inspection-request-work-orders.test.ts apps/backend/modules/inspection/inspection-request-station-validation.test.ts apps/backend/modules/inspection/inspection-request-create.service.test.ts apps/backend/modules/inspection/inspection-request-create-adversarial.test.ts scripts/e2e/safety.test.mjs` | 0；195 PASS/0 FAIL | unit-final.log |
| 后端类型 | `pnpm --dir apps/backend exec tsc --noEmit` | 0 | backend-type-final.log |
| Web 类型 | `pnpm --dir apps/web-antd run typecheck` | 0 | web-type-final.log |
| ESLint | `pnpm exec eslint <本批相关文件>`，完整参数见 final-checks.json | 0，无错误/警告 | lint-final.log |
| 架构早期检查 | `pnpm check:qms-arch` | 1，孤立 after-sales-write-authorization.test.ts 违反 B-TEST2 | architecture-final.log，保留历史 |
| 架构修正后核验 | `pnpm check:qms-arch` | **0，0 violations**；测试现位于同名 API handler 旁 | architecture-verified.log |
| API 权限响应单测 | `rtk vitest run 'apps/backend/api/qms/after-sales/[id].put.test.ts'` | 0；2 PASS/0 FAIL，PUT/DELETE 拒绝时不执行写服务 | api-authorization-verified.log |

历史架构失败不能冒充通过；修正归属后补跑门禁已通过，存量 baseline 提示未新增。195 例单测日志不含新增 API 路由测试，后者本轮单独执行 2/2 通过，未将其混入原 195 例统计。

## 7. 源码、产物与完整路径

- 最终源码聚合 SHA256：`a30808276557540ac04e97cd81a9bc73556491d52cdaf687a985cba95adff712`；本轮逐一计算 `sourceFiles` 的 51 文件，差异 0。该指纹覆盖声明列表，并不等于全仓每个文件都被 hash；新测试/规则文档另按本轮清单核查。
- 最终目录：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/6243799bdb985c9300cf0b36/`。
- 运行/清理/版本/源文件哈希：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/6243799bdb985c9300cf0b36/run.json`。
- 逐用例结果：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/6243799bdb985c9300cf0b36/report.json`；脱敏 HTML：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/6243799bdb985c9300cf0b36/report.html`。
- 截图：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/6243799bdb985c9300cf0b36/login-rejected.png`、`login-success.png`、`logged-out.png`、`request-reopened.png`；同目录 `passed-*.png` 为其他场景遮盖输入框截图（完整列表见本轮 closeout-audit.json）。
- 脱敏日志：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/6243799bdb985c9300cf0b36/api.log`、`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/6243799bdb985c9300cf0b36/web.log`、`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/6243799bdb985c9300cf0b36/playwright.log`；seed：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/6243799bdb985c9300cf0b36/seed.json`；业务快照：同目录 `state-*.json`、`branch-*.json`、`after-sales-*.json`。
- 定向售后目录：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/a80f85e1d8824aa1b67d54ef/`；失败原始证据：`/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/a0b706d58fc0d2086b594bac/` 与 `/Users/zhaoxiaojie/代码/Quality-Guardian/output/playwright/421b56574c62df083d3dc093/`，均保留 report.json/report.html/run.json/api.log。
- trace/video **未生成**：原始格式可能保存登录密码/token/cookie，配置关闭；不虚构 trace 路径。交付使用遮盖截图、脱敏日志和只读业务快照。

## 8. 隔离与资源清理

- 实际环境：darwin/arm64，Node v22.22.3，原生 container CLI 1.0.0，Playwright 1.53.2 / Chromium 138.0.7204.23；MySQL 8.0.46、Redis 8.8.0，单 worker，retries=0。
- 最终独立数据库 `qgs_e2e_6243799bdb985c9300cf0b36`，loopback MySQL 62930、Redis 62937、API 62962、Web 62963。专用动态账号/凭据通过环境注入，未读取 .env/秘密文件、不输出凭据。
- 显式 isolated/test 模式、loopback、专属端口/库/账号、container owner label 与镜像/端口归属多重核验后才迁移/seed；不是仅看数据库名称后缀。seed 本 runId 初始 requestsBeforeUI=0、afterSalesBeforeUI=0。
- 独立重复证据：定向售后 run `a80f85…` 使用不同数据库及 61921/61925/61959/61960 端口，初始零业务数据，4/4；最终联合 run 售后再次 4/4。两个版本指纹不同，前者为定向历史、最终版本由联合 run 验收，不宣称最终 24 例两轮完整重复。
- 最终 run.json 四条 cleanup：两容器删除、临时目录删除、进程全部退出/无命名卷新增/专属容器不存在/四端口关闭。resourcesBefore/After 均只有原有 ut-postgres；volumesBefore/After 均为原有 qms-container-mysql-data 与 qms-container-redis-data。
- 本轮现场只读 `container list --all --quiet`、`container volume list --quiet` 再核验上述既有资源保留；`lsof` 查询最终四端口无监听。不 stop/delete 原有资源、不 prune。
- 旧负向对照 `6745b72174740536ffaa1116` 7通过/1失败、恢复 `68d6da4629109dc2c1ca7702` 8/8 属早期核心快照，用于历史失败捕获证据，不宣称是当前 24 例故障注入；本批未机械重复对照。

## 9. 未验证范围与交付结论

本批桌面鉴权、20 例报检及4例售后联合验收通过，三项已检出 BUG 完成修复与回归。计量、监督、供应商治理、质量损失和整车调试等桌面独立模块仍待后续批次验收；售后仅按现有登记/处理完成/软删除规则，不虚构退换货物流/支付或审批。移动 H5 与微信端排除。

历史迁移从空库不可完整重放：E2E 通过当前 schema 自动生成临时 baseline 后 migrate deploy，验证当前 schema 的业务，**不验证生产升级迁移史**。未验证生产部署、CI、跨进程并发和其他浏览器。

本轮只补写同一交付报告、核验相关门禁与源码一致性，复用实际已执行的最终 E2E；没有改被测运行行为，不重复全套。文件保持未暂存、未提交供协调复核。[第一阶段三例记录](web-e2e-phase1-verification.md)仅为历史。
