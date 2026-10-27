# 履约只读增量同步（fulfillment-sync）

本模块按《R2 QMS → 履约 只读增量同步接口契约（v1）》向外部履约系统提供 7 个只读增量接口。模块不拥有任何表，只编排各主数据/业务模块公开的只读方法并做字段裁剪与游标拼装；不写库、不发事件、不记审计。

> 履约维护工单的写接口（`POST/PUT /api/integration/fulfillment/work-orders…`、`…/cancel`）同在 `/api/integration/fulfillment/` 路径下，但属于 **work-order 模块**（写库、记审计），见 `modules/work-order/ARCHITECTURE.md`「履约写接口」。本模块仍只读。

## 端点

| 端点（均为 GET） | 来源（经对方 `index.ts`） | key |
| --- | --- | --- |
| `/api/integration/fulfillment/work-orders` | `WorkOrderService.listSyncPage` | `workOrderNumber` |
| `/api/integration/fulfillment/suppliers` | `SupplierService.listSyncPage` | `id` |
| `/api/integration/fulfillment/teams` | `TeamIdentityService.listSyncPage` | `id` |
| `/api/integration/fulfillment/processes` | `ProcessMasterService.listSyncPage` | `id` |
| `/api/integration/fulfillment/departments` | `DeptService.listSyncPage` | `id` |
| `/api/integration/fulfillment/users` | `UserService.listSyncPage` | `id` |
| `/api/integration/fulfillment/inspections` | `InspectionRequestSyncService.listSyncPage` | `id` |

另有一个按需只读接口（不是增量流）：

| 端点（GET） | 来源（经对方 `index.ts`） | 说明 |
| --- | --- | --- |
| `/api/integration/fulfillment/work-orders/:workOrderNumber/bom` | `PlanningBomService.listByWorkOrder` | 该工单全部 BOM 行及按 `position` 排序的必经工序 |
| `/api/integration/fulfillment/customers` | `DictionaryService.getOptions('customer_name')` | 履约新建/修改工单选客户：`[{ id, name }]`，字典启用且未删除，按名称排序；`name` 为工单存的 canonical 客户名（`dictKey`） |

路由文件只调用 `handleFulfillmentSyncRequest(event, resource)`、`handleFulfillmentBomRequest(event)` 或 `handleFulfillmentCustomersRequest(event)`；认证、zod 校验、响应与 `logApiError` 统一在 handler 内完成。

## 认证

- 请求头 `X-Identity-Client-Id` / `X-Identity-Client-Secret`，与身份桥同一组凭据（`QMS_IDENTITY_CLIENT_ID` / `QMS_IDENTITY_CLIENT_SECRET`），复用身份桥导出的 `assertIdentityClientHeaders`：id 与 secret 都经 SHA-256 定长摘要后 `timingSafeEqual` 比较，两项比较均执行后再判定。
- 凭据未配置或不合法（secret 少于 32 字符等）一律 503，凭据不符 401；认证先于参数解析和任何数据库访问，失败不放行。
- `middleware/3.auth.ts` 对 `GET /api/integration/fulfillment/*` 跳过 JWT；写方法只放行 work-order 模块的三个工单写接口（精确匹配方法与路径），其他写方法仍要求 Bearer。路径不在 `4.data-scope.ts` 范围前缀内，不做数据权限过滤；`2.request-dedupe.ts` 只拦写方法，GET 不受影响。
- 响应带 `Cache-Control: no-store`。日志沿用 logger 对两个专用 header 的遮蔽，不记录请求头。

## 参数、排序与游标

- `since`：ISO 8601（需带时区，建议带毫秒），缺省为从头读；`afterId`：可选，必须与 `since` 同时出现；`limit`：1–100，默认 100，越界返回 400（不截断）。
- 查询条件 `updatedAt > since OR (updatedAt = since AND key > afterId)`，`ORDER BY updatedAt ASC, key ASC`，在数据库层 `take(limit)`。只给 `since` 不给 `afterId` 时等价于 `updatedAt >= since`，不会漏掉同一时刻的行。
- 包含 `isDeleted = true` 的行（这是本模块对"软删除表查询必须过滤 isDeleted"规则的有意例外，供履约同步删除）。
- `nextCursor` 为本页最后一行的 `{ since: updatedAt, afterId: key }`；本页不足 `limit` 时为 `null`，表示已追平。履约下次应带上一次非空 `nextCursor`，追平后保存最后一行的游标继续轮询。
- 6 张业务表新增 `(updatedAt, key)` 复合索引（迁移 `20261017090000_add_fulfillment_sync_cursor_indexes`）。schema 中 `updatedAt` 为 Prisma 默认 `DATETIME(3)`；游标值直接取自数据库返回值，即便某环境实际列为秒精度，`(updatedAt, key)` 复合比较仍然正确，只是同秒行更多地依赖 key 排序。

## 资源语义要点

- **work-orders**：每行 `workOrderNumber, customerName, customerNameId, projectName, division, divisionId, quantity, deliveryDate, status, version, isDeleted, updatedAt`（`customerNameId`、`division`、`divisionId`、`version` 于 2026-10-27 只加字段新增），与工单写接口返回的工单对象同形（`toFulfillmentWorkOrder`）。

- **users**：只输出 `id, username, realName, departmentId, isActive, isDeleted, updatedAt`；`departmentId` 来自 `users.department`，存的是 `departments.id` 而非名称；`isActive = status === ACTIVE`。查询 select 本身不取手机号、邮箱、企业微信 ID、微信 openid、密码。
- **每个接口只读一张表**：游标顺序完全由 MySQL 的 `ORDER BY updatedAt, key` 决定，JS 端不对 key 做任何比较或排序。`id` 列为 `utf8mb4_unicode_ci`（大小写不敏感），与 JS 字符串比较顺序不同（如大写 `SUP-…` 与小写 cuid），跨表在内存中归并会让 `afterId` 跳过另一表的同刻行，因此 TEAM 不再并入供应商流。
- **suppliers**：只输出 `suppliers` 表行，字段 `id, name, category, outsourcingMode, status, isDeleted, updatedAt`，并保留 `kind='SUPPLIER'` 以兼容 v1 消费方；不再输出 TEAM 行。
- **teams**：来自 `dictionaries`（`dictType='team'`），输出 `id, name, status, isDeleted, updatedAt`；`id` 即报检 `teamId` 指向的同一个 id，`name` 为 `dictValue`，`status` 为 `ACTIVE`/`INACTIVE`（`status=1` 为 ACTIVE）；TEAM 退役即软删除，会以 `isDeleted=true` 输出。查询走现有 `dictType` 索引后对 TEAM 行排序，TEAM 字典规模小，未新增 `(updatedAt, id)` 索引。
- **inspections**（报检单 `qms_inspection_requests`）：`workOrderNumbers` 为主工单 + `qms_inspection_request_work_orders` 关联工单，去重、主工单在前；`teamName` 为报检上的 `team` 快照，`supplierName`、`processName`、`partName` 同为报检快照。
  - `inspectionResult` 列默认 `PASS`，**PASS 不代表已检验合格**，需结合 `status`。
  - 关单判不合格（result=FAIL）时写 `inspectionResult=FAIL` 与 `unqualifiedQuantity`，但 **`status` 仍为 `INSPECTING`、`closedAt` 为 null**；复检合格后会被覆盖为 `CLOSED` + `PASS`。
  - 因此"曾经不合格"只能靠 `linkedIssueId` / `linkedIssueNo` 非空识别，不能只看当前 `inspectionResult`。
- 时间字段一律 ISO 8601 UTC 字符串；`processes.status`、`departments.status` 原样输出整数（1=启用）。

## 工单 BOM（按需读取）

- 履约在用户点“从 QMS BOM 导入”时实时调用，不做游标同步：`project_boms` 没有软删除（硬删），`project_bom_required_processes` 增删改不刷新父行 `updated_at`，增量流会静默漏掉变化。
- 响应 `{ workOrderNumber, items }`，每行 `id, partId, partName, partNumber, material, quantity, unit, remarks, updatedAt, processes`；`processes` 为 `[{ position, processId, processName }]`，按 `position, id` 排序后重新编号为 0..n-1；`processName` 优先取工序主数据现名，工序已删（外键 SetNull）时 `processId` 为 null、保留快照名。没有工序身份行的旧数据回退解析 `required_processes` 文本快照，`processId` 一律为 null。
- 未知工单返回空列表（不报 404）；工单号 trim 后 1–191 字符，否则 400。认证、`Cache-Control: no-store`、错误处理与增量流一致，同样无限流。

## 已知边界

- 关联表 `qms_inspection_request_work_orders` 没有 `updatedAt`。当前代码只在创建报检时与主表同一次嵌套写入，主表 `updatedAt` 同步产生；仓库内没有单独增删关联行的写路径。若今后新增"修改报检关联工单"的写路径，必须在同一事务内更新主表（触发 Prisma `@updatedAt`），否则履约收不到变化。工单号作为主键若在库内被直接改名，外键 `ON UPDATE CASCADE` 会改写报检与关联表而不刷新 `updatedAt`，应用内无此入口。
- 以 `updatedAt` 为游标的通用风险：长事务提交时 `updatedAt` 早于已被读取的游标时，该行会被跳过。履约可定期以较早的 `since` 做对账重扫。
- 本模块无限流；调用方为受控的单一客户端，容量由入口代理控制。
