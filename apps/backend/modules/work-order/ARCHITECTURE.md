# work-order 模块

## 职责

work-order 负责工单主数据、工单要求、聚合看板和进度查询。工单号是业务唯一键；部件、工序和班组必须使用各自 canonical ID。

**工单主数据由履约系统维护（2026-10-27 起）**：新建、修改、取消只经 `/api/integration/fulfillment/work-orders` 写入（见下文“履约写接口”）。QMS 原 `api/qms/work-order` 的 `index.post` / `index.put` / `import.post` / `index.delete` / `batch-delete.post` 保留路由但一律 403「工单由履约系统维护，请到履约系统操作」（`work-order-managed-externally.ts`）；查看、导出、统计、工单要求（requirements）等子功能不变。

## 要求身份契约

- 新建和编辑 V2 要求仅提交 `partId/processId`，服务端按 ID 重建 `partName/processName` 快照。
- 部件选项来自当前工单 BOM 的 `partId`，工序选项来自 `processes.id`。字典 ID、BOM 行 ID 和名称都不能替代主数据 ID。
- `identityContractVersion=2` 禁止客户端同时提交部件/工序名称，避免改名窗口产生 ID/名称冲突。
- 创建和普通编辑强制 `identityContractVersion=2`；V1 name-only 写入不再被 schema 或 service 接受。确认和撤销是独立状态操作，不携带身份字段，要求独立 `QMS:WorkOrder:Confirm`；普通编辑仍要求 `QMS:WorkOrder:Edit`。

Historical requirements keep their original `processName` snapshots. Ordered release maintenance bootstraps an empty process identity space once, then fills only null `processId` values with compare-and-set updates. Existing IDs and names are never overwritten; missing or ambiguous matches are written to `unresolved_master_data_refs`.

## Governance resolution

Open governance audits for work order project, division, and customer identities and requirement process, part, requirement-name, and responsible-TEAM identities can be resolved online. Resolution validates the selected canonical identity through its owning service, applies the same raw ID/name mapping in bounded batches, and uses compare-and-set updates. The canonical ID is repaired while the historical name snapshot remains unchanged. Only audits whose source records were actually updated are closed; deleted or concurrently changed records remain open.

## 聚合身份契约

- 要求和检验只在 `partId + processId` 同时相等时匹配。
- 同 ID 改名后合并并显示当前 canonical 名称；不同 ID 即使同名也保持分离。
- 缺失 ID 使用按源记录隔离的内部 `MISSING:<source>:<rowId>` 键，不互相归并、不互相抵扣。
- 无效非空 ID 保留原值并标记 `INVALID`，不回退名称。
- 缺失身份的检验点进入 `unattributedInspectedPoints`，参与数据质量统计，但不误抵扣计划完成量。

## BOM 工序关系

`project_bom_required_processes` 是 BOM 所需工序的正式关系表。旧 `required_processes` JSON 仅作历史快照和兼容展示，不参与在线统计关联。存量回填只在全部名称唯一精确解析时原子写入，禁止部分回填。

## 乐观锁契约（OPTIMISTIC-LOCK-001）

- `work_orders.version`（`Int @default(1)`）是交互式编辑的乐观锁令牌：列表响应携带 `version`，编辑（PUT）与删除（DELETE）必须提交客户端读取到的 `version`，缺失或非法 → 400。
- 版本化写集中在 `work-order-versioned-write.service.ts`：`updateMany({ where: { workOrderNumber, version: expectedVersion, ...scopeWhere }, data: { ..., version: { increment: 1 } } })`，count=0 时只读 scoped 复查，不存在/无权限 → 404，版本过期 → 409 `OPTIMISTIC_LOCK_CONFLICT`。
- import upsert / create-restore 属于批量/系统语义（PRODUCT_DECISION），不要求逐行用户 `version`；系统删除（无 `version`）保持 force-delete。

## 履约写接口（fulfillment integration）

契约：《履约新建工单：QMS ↔ 履约接口约定 v1》（2026-10-27）。路由在 `api/integration/fulfillment/` 下，业务在本模块：

| 端点 | 说明 |
| --- | --- |
| `POST /api/integration/fulfillment/work-orders` | 新建；body `{ workOrderNumber, customerNameId, projectName?, divisionId?, quantity, deliveryDate('YYYY-MM-DD'), actorUserId }`；status 固定 OPEN、`multiStationEnabled=false`、`effectiveTime=null` |
| `PUT /api/integration/fulfillment/work-orders/:workOrderNumber` | 修改；body `{ version, actorUserId, customerNameId?, projectName?, divisionId?, quantity?, deliveryDate?, status?(OPEN/IN_PROGRESS/COMPLETED) }`；body 中出现不同的 `workOrderNumber` → 400；已取消 → 400；`divisionId: null` 同时清空事业部名称与 ID |
| `POST /api/integration/fulfillment/work-orders/:workOrderNumber/cancel` | 取消；body `{ version, actorUserId }`；已取消再取消直接返回当前对象（幂等，不校验 version、不再记审计） |

- 分层：路由只调 `handleFulfillmentWorkOrderWrite(event, action, assertFulfillmentWorkOrderPermission)`；handler（`work-order-integration.handler.ts`）先做身份桥客户端凭据校验（复用 `assertIdentityClientHeaders`：未配置 503、不符 401），再读 body、zod 校验（`work-order-integration.schema.ts`，失败 400 + 中文字段名），最后调 `WorkOrderIntegrationService`。
- 复用而非复制：建单走 `createOrRestoreWorkOrder`（查重 409 `WORK_ORDER_EXISTS`、软删除同号恢复、审计），改单/取消走 `applyVersionedWorkOrderUpdate`（OPTIMISTIC-LOCK-001 同一 CAS，版本过期 409 `OPTIMISTIC_LOCK_CONFLICT`），字段构造走 `buildWorkOrderUpdateData` / `buildWorkOrderGovernedFields`（客户/事业部名称由 canonical ID 回填）。这些函数在 `work-order-write.service.ts` / `work-order-versioned-write.service.ts`，不依赖 H3 用户会话，只需要操作人 ID；QMS 路由服务同样调用它们。
- 操作人：每个写请求带 `actorUserId`，经 `UserService.findExistingById` 校验存在且未删除，否则 400；审计日志 `userId` 记该用户，details 末尾带「来源: 履约系统」。
- 客户/事业部 ID 先经 `MasterDataGovernanceKernel.resolveCanonicalNameById` 校验（字典 `customer_name` 启用未删除、`departments` 启用未删除），无效 → 400。
- 数据权限：履约是受信任的机密客户端、自管其用户权限，写接口不套用 QMS 行级 DataScope（`systemClientScope`）；每次写仍是 `{ workOrderNumber, version, isDeleted: false }` 的 CAS，修改另加 `status != CANCELLED` 守卫。
- 中间件：`3.auth.ts` 只对这三个精确的“方法 + 路径”跳过 JWT（`work-order-integration-routes.ts`），其他写方法仍要求 Bearer；`2.request-dedupe.ts` 对它们不做 3 秒防重，避免取消重试被误判 409，并发安全由版本 CAS 保证。
- 响应：成功 `{ code: 0, data: 工单对象 }`；失败 HTTP 400/404/409（错误码在 `error.code`，如 `WORK_ORDER_EXISTS`、`OPTIMISTIC_LOCK_CONFLICT`），`message` 为中文，可直接展示。工单对象形状见 `work-order-fulfillment-dto.ts`，与同步接口 `GET /work-orders` 的 items 相同。
