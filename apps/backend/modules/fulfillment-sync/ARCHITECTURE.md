# 履约只读增量同步（fulfillment-sync）

本模块按《R2 QMS → 履约 只读增量同步接口契约（v1）》向外部履约系统提供 6 个只读增量接口。模块不拥有任何表，只编排各主数据/业务模块公开的只读方法并做字段裁剪与游标拼装；不写库、不发事件、不记审计。

## 端点

| 端点（均为 GET） | 来源（经对方 `index.ts`） | key |
| --- | --- | --- |
| `/api/integration/fulfillment/work-orders` | `WorkOrderService.listSyncPage` | `workOrderNumber` |
| `/api/integration/fulfillment/suppliers` | `SupplierService.listSyncPage` + `TeamIdentityService.listSyncPage` | `id` |
| `/api/integration/fulfillment/processes` | `ProcessMasterService.listSyncPage` | `id` |
| `/api/integration/fulfillment/departments` | `DeptService.listSyncPage` | `id` |
| `/api/integration/fulfillment/users` | `UserService.listSyncPage` | `id` |
| `/api/integration/fulfillment/inspections` | `InspectionRequestSyncService.listSyncPage` | `id` |

路由文件只调用 `handleFulfillmentSyncRequest(event, resource)`；认证、zod 校验、响应与 `logApiError` 统一在 handler 内完成。

## 认证

- 请求头 `X-Identity-Client-Id` / `X-Identity-Client-Secret`，与身份桥同一组凭据（`QMS_IDENTITY_CLIENT_ID` / `QMS_IDENTITY_CLIENT_SECRET`），复用身份桥导出的 `assertIdentityClientHeaders`：id 与 secret 都经 SHA-256 定长摘要后 `timingSafeEqual` 比较，两项比较均执行后再判定。
- 凭据未配置或不合法（secret 少于 32 字符等）一律 503，凭据不符 401；认证先于参数解析和任何数据库访问，失败不放行。
- `middleware/3.auth.ts` 仅对 `GET /api/integration/fulfillment/*` 跳过 JWT；其他方法仍要求 Bearer。路径不在 `4.data-scope.ts` 范围前缀内，不做数据权限过滤；`2.request-dedupe.ts` 只拦写方法，GET 不受影响。
- 响应带 `Cache-Control: no-store`。日志沿用 logger 对两个专用 header 的遮蔽，不记录请求头。

## 参数、排序与游标

- `since`：ISO 8601（需带时区，建议带毫秒），缺省为从头读；`afterId`：可选，必须与 `since` 同时出现；`limit`：1–100，默认 100，越界返回 400（不截断）。
- 查询条件 `updatedAt > since OR (updatedAt = since AND key > afterId)`，`ORDER BY updatedAt ASC, key ASC`，在数据库层 `take(limit)`。只给 `since` 不给 `afterId` 时等价于 `updatedAt >= since`，不会漏掉同一时刻的行。
- 包含 `isDeleted = true` 的行（这是本模块对"软删除表查询必须过滤 isDeleted"规则的有意例外，供履约同步删除）。
- `nextCursor` 为本页最后一行的 `{ since: updatedAt, afterId: key }`；本页不足 `limit` 时为 `null`，表示已追平。履约下次应带上一次非空 `nextCursor`，追平后保存最后一行的游标继续轮询。
- 6 张表新增 `(updatedAt, key)` 复合索引（迁移 `20261017090000_add_fulfillment_sync_cursor_indexes`）。schema 中 `updatedAt` 为 Prisma 默认 `DATETIME(3)`；游标值直接取自数据库返回值，即便某环境实际列为秒精度，`(updatedAt, key)` 复合比较仍然正确，只是同秒行更多地依赖 key 排序。

## 资源语义要点

- **users**：只输出 `id, username, realName, departmentId, isActive, isDeleted, updatedAt`；`departmentId` 来自 `users.department`，存的是 `departments.id` 而非名称；`isActive = status === ACTIVE`。查询 select 本身不取手机号、邮箱、企业微信 ID、微信 openid、密码。
- **suppliers**：同一游标流合并两类来源。`kind='SUPPLIER'` 来自 `suppliers`；`kind='TEAM'` 来自 `dictionaries`（`dictType='team'`），`id` 即报检 `teamId` 指向的同一个 id，`name` 为 `dictValue`，`status` 为 `ACTIVE`/`INACTIVE`（`status=1` 为 ACTIVE），`category`、`outsourcingMode` 为 null；TEAM 退役即软删除，会以 `isDeleted=true` 输出。两源各自按相同游标 `take(limit)` 后在内存中按 `(updatedAt, id)` 归并、截取 `limit` 行（最多 2×limit 行参与归并，不做全表加载）。
- **inspections**（报检单 `qms_inspection_requests`）：`workOrderNumbers` 为主工单 + `qms_inspection_request_work_orders` 关联工单，去重、主工单在前；`teamName` 为报检上的 `team` 快照，`supplierName`、`processName`、`partName` 同为报检快照。
  - `inspectionResult` 列默认 `PASS`，**PASS 不代表已检验合格**，需结合 `status`。
  - 关单判不合格（result=FAIL）时写 `inspectionResult=FAIL` 与 `unqualifiedQuantity`，但 **`status` 仍为 `INSPECTING`、`closedAt` 为 null**；复检合格后会被覆盖为 `CLOSED` + `PASS`。
  - 因此"曾经不合格"只能靠 `linkedIssueId` / `linkedIssueNo` 非空识别，不能只看当前 `inspectionResult`。
- 时间字段一律 ISO 8601 UTC 字符串；`processes.status`、`departments.status` 原样输出整数（1=启用）。

## 已知边界

- 关联表 `qms_inspection_request_work_orders` 没有 `updatedAt`。当前代码只在创建报检时与主表同一次嵌套写入，主表 `updatedAt` 同步产生；仓库内没有单独增删关联行的写路径。若今后新增"修改报检关联工单"的写路径，必须在同一事务内更新主表（触发 Prisma `@updatedAt`），否则履约收不到变化。工单号作为主键若在库内被直接改名，外键 `ON UPDATE CASCADE` 会改写报检与关联表而不刷新 `updatedAt`，应用内无此入口。
- 以 `updatedAt` 为游标的通用风险：长事务提交时 `updatedAt` 早于已被读取的游标时，该行会被跳过。履约可定期以较早的 `since` 做对账重扫。
- 本模块无限流；调用方为受控的单一客户端，容量由入口代理控制。
