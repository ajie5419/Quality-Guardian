# 请求级幂等（Request Idempotency）

> 权威文档：IDEMPOTENCY-KEY-001 的落地页。定义「什么时候必须用 Idempotency-Key、什么时候不用、key 生命周期、replay / conflict、事务边界」。业务代码遵守本页规则，Architecture Guard（R-IDEMPOTENCY）与测试强制增量不回归。

## 1. 基本概念区分

**Unique Number ≠ Request Idempotency。** `requestNo` / `lossId` / `serialNumber` 等唯一编号只保证编号不冲突（P2002 重试），不保证相同网络请求不会生成两条业务实体——每次请求都会生成新编号，重复请求仍然双写。

**CAS ≠ Request Idempotency。** 状态 CAS（`updateMany({ where: { id, status } })`）解决并发状态推进互斥，不解决「同一个创建请求被重放两次」。

**Business Key ≠ Request Idempotency。** `workOrderNumber @unique` / `name @unique` 等业务键天然去重；没有天然业务键的创建入口才需要请求级幂等。

## 2. 什么时候必须用 / 什么时候不用

必须用（D 类，无天然业务键且重复会产生业务实体/副作用翻倍）：

| 入口 | 状态 | 说明 |
| --- | --- | --- |
| `POST /qms/quality-loss` | ✅ PHASE-1 Pilot | 金额/损失事实翻倍（P0） |
| `POST /qms/inspection/requests/v2`（含 public v2 已登录分支） | ✅ PHASE-2 | `qms.inspection-request.create` |
| `POST /qms/after-sales` | ✅ PHASE-2 | `qms.after-sales.create` |
| `POST /qms/inspection/issues`（NC create） | ✅ PHASE-2 | `qms.inspection-nc.create` |
| `POST /qms/inspection/records` | ✅ PHASE-2 | `qms.inspection-record.create` |
| `POST /qms/vehicle-commissioning/issues` | ✅ PHASE-2 | `qms.vehicle-commissioning-issue.create` |

不用（A 类，已有唯一键 / upsert / CAS 兜底）：

- `work-order`（`workOrderNumber @unique` + restore-on-create）
- `supplier`（`name @unique` + upsert）
- `metrology borrow`（instrument `borrowStatus` CAS 互斥）
- `daily-reports`（`@@unique([date, reporter])` + upsert）
- `scheduler sync`（`jobKey @unique` + upsert）

**公开匿名入口**（`POST /api/qms/public/inspection/requests/v2` 无 token 分支）：不强制 Idempotency-Key，见 §13 PUBLIC IDEMPOTENCY IDENTITY GAP。

## 3. Key Contract

- 传输：HTTP Header `Idempotency-Key`。
- 格式：8～128 字符，字符集 `[A-Za-z0-9._~-]`，不允许空白；推荐客户端生成 UUID。
- 客户端生命周期（前端契约）：
  - 每次「用户主动开始一次创建操作」生成一个新 key。
  - 同一次提交的网络重试 / 按钮重试 / 请求重发 **必须复用同一个 key**。
  - 真正重新新建（内容已变更或明确新建）时生成新 key。
  - 禁止每次 HTTP retry 都生成新 UUID（否则服务端幂等完全失效）。
- 禁止把内部 DB 主键暴露为 key。

## 4. Actor / Operation 绑定

幂等 identity 至少由 `actorKey + operationKey + idempotencyKey` 组成：

- 登录用户：`actorKey = userId`；匿名/公开入口后续单独设计（绑定资源/设备上下文）。
- `operationKey` 示例：`qms.quality-loss.create`。
- 禁止仅 `idempotencyKey @unique`：User A 的 key=123 不得阻塞 User B 的 key=123。

## 5. Request Fingerprint

- 只选择「真正决定业务创建语义的稳定字段」（工单/部件、类型、金额、日期、责任部门…）。
- 排除：附件顺序、临时 UI 字段、timestamp、非语义 metadata。
- canonical stable object → stable serialization（键排序、剔除 undefined）→ SHA-256。
- 用途**唯一**：检测「同 key + 不同 payload」（409 REUSED）。
- 禁止：用 body hash 判断两个不同 key 是否「同一业务」；禁止内容相似自动去重。

## 6. Claim / Replay 流程

1. 校验 `Idempotency-Key`（格式/长度），缺失 → 400，且**不占用 key**。
2. 输入校验 / RBAC / DataScope 失败 → 400/403，不占用 key。
3. 事务内：创建 `PROCESSING` claim 行 → 执行业务写 → 标记 `COMPLETED` （记录 `resourceType / resourceId / responseStatus / responseBody` 最小快照）。
4. 并发重复请求：唯一键竞争只有一个成功；失败方**不启动第二次业务 create**，读取已落定记录：
   - fingerprint 相同且 COMPLETED → 返回第一次结果（`replayed=true`）。
   - fingerprint 不同 → 409 `IDEMPOTENCY_KEY_REUSED`。
   - 仍 PROCESSING → 409 `IDEMPOTENCY_REQUEST_IN_PROGRESS`（禁止在事务内 sleep/poll）。
   - 无落定记录（胜者事务回滚）→ 重新 claim 一次。

## 7. Transaction Boundary

**Idempotency claim 与业务 create 必须在同一个 MySQL transaction：**

- 业务 create 成功 ⇔ claim 行 `COMPLETED` 同事务成立。
- 业务 transaction rollback → claim 行一起回滚，key 不产生 COMPLETED zombie，可复用。
- 禁止：先写 claim 再 COMMIT 后创建业务；也禁止业务成功后事务外补写 claim。

## 8. Expiry

- `expiresAt` 由各模块配置（Pilot：`QUALITY_LOSS_IDEMPOTENCY_WINDOW_MS = 5 分钟`），不散落硬编码。
- 未过期前必须保持 replay 语义；过期后同 key 视为新请求。
- 过期语义为 **Logical Reclaim（原子抢占）**：过期 `PROCESSING / COMPLETED` 行通过 `updateMany({ where: { actorKey, operationKey, idempotencyKey, expiresAt <= now, status IN (...) } })` CAS 抢占；`count !== 1` 时读取并解析新 claim。抢占成功后按新请求执行，不物理删除。
- 并发 reclaim 由 claim 唯一键 + CAS 共同保证单主；utility 内置 `MAX_CLAIM_RECURSION_DEPTH` 护栏。
- **物理清理**（过期行删除 / 归档）为后续维护专项，登记 `IDEMPOTENCY-RETENTION-001`；IDEMPOTENCY-KEY-001 不建立 scheduler。

## 9. Replay 响应与安全

- 同 key + same fingerprint：返回第一次成功结果（同 `resourceId`，不重新生成 `lossId`/`createdAt`），不破坏现有 API 契约；可通过内部日志标识 replay。
- Replay 前仍走 Authentication + RBAC + 当前访问上下文（`resourceGuard` 复查资源存在且可访问）；资源已删除/权限变化 → 404，不绕过安全边界。

## 10. 副作用边界

两层机制同时存在、解决不同问题：

- Request Idempotency：用户请求重复。
- Queue Unique（`@@unique([source, sourcePk])` 等）：后台副作用重复。

Replay 不得再次触发：业务 audit、queue job、通知、评分刷新。

## 11. 存储模型

`idempotency_requests` 表（MySQL，正式 migration）：

- 唯一键 `@@unique([actorKey, operationKey, idempotencyKey])`（并发抢占靠它）。
- `expiresAt` 索引（清理/过期复用）。
- 状态最小化：`PROCESSING / COMPLETED`；业务失败整体回滚，不持久化 FAILED。
- 不用 `isDeleted` 作为幂等生命周期模型。
- `responseBody` 只存最小响应快照，禁止变成大 JSON 仓库。

## 12. 实现位置

- `apps/backend/modules/idempotency/`：`request-idempotency.ts`（claim/replay/conflict）、 `request-fingerprint.ts`（稳定 SHA-256）、`idempotency-key.ts`（Header 校验）。
- Utility 只管 claim/fingerprint/replay；业务权限、业务事务、状态机仍由 Domain Service 负责。
- Guard：`R-IDEMPOTENCY` 配置式规则 `IDEMPOTENCY_PROTECTED_CREATE_OPERATIONS` （六入口 filePattern → operationKey）；protected create 文件必须调用 `withRequestIdempotency` 且引用其注册 operationKey，违规 CI 失败。
- 前端契约：`useCreateOperationId()`（`#/composables/useCreateOperationId.ts`）生成/复用/重置operation id；`isIdempotencyReusedError()` 识别 409 REUSED。

## 13. PUBLIC IDEMPOTENCY IDENTITY GAP

**状态：已知缺口（已登记），PHASE-2 不解决。**

`POST /api/qms/public/inspection/requests/v2` 的无 token（匿名扫码）分支没有可验证的安全上下文（无 token / 扫码 token / 资源上下文），因此**不强制 Idempotency-Key**：

- 禁止以 IP / User-Agent / 设备指纹作为匿名 actor 身份（不可信、可伪造、会造成跨用户误判）。
- 匿名分支继续走旧 `createRequest` 路径，不占用 claim。
- 已登录分支（web 客户端自动附带 token）与 web v2 使用同一 `operationKey = qms.inspection-request.create` + `actorKey = user:{id}`，同一 key 跨 web / public 重试可正确 replay。
- 后续在获得稳定公开身份上下文（扫码 token / 资源绑定）后，将匿名分支纳入同一幂等范式。

## 14. 已登记后续专项

- `IDEMPOTENCY-RETENTION-001`：`idempotency_requests` 过期行的物理清理 / 归档策略（保留窗口、批量删除、scheduler 归属）。
