# idempotency 模块

## 职责

请求级幂等最小基线（IDEMPOTENCY-KEY-001）：提供 Idempotency-Key 校验、稳定 request fingerprint 与 MySQL 同事务 claim/replay 的最小公共能力。只服务「同一个业务请求因网络重试/双击被重复提交」的场景，不替代业务唯一键、CAS 或业务状态机。

## 组成

- `request-idempotency.ts`：`withRequestIdempotency` —— PROCESSING claim 行与业务写同一事务；P2002 并发败者读已落定记录（同 fingerprint replay / 不同 fingerprint 409 REUSED / PROCESSING 409 IN_PROGRESS / 无落定记录重新 claim）；`resourceGuard` 在 replay 前复查资源存在性。
- `request-fingerprint.ts`：`buildRequestFingerprint` —— canonical 键序 + 剔除 undefined 后 SHA-256；仅用于检测「同 key 不同 payload」，禁止用作业务相似度判断。
- `idempotency-key.ts`：`normalizeIdempotencyKey` —— 8～128 字符、字符集 `[A-Za-z0-9._~-]`、非空白。

## 边界

- Utility 只负责 key claim / fingerprint 校验 / completed replay / conflict；业务权限、业务事务、状态机由 Domain Service 负责。
- 幂等 identity = `actorKey(userId) + operationKey + idempotencyKey`；禁止仅 `idempotencyKey` 全局唯一（用户间 key 隔离）。
- 未过期前保持 replay 语义；`expiresAt` 支持清理与过期复用。
- 业务失败整体回滚，不持久化 FAILED；replay 不重复 audit/queue/通知副作用。
- 匿名/公开入口、其它 P1 模块迁移属 PHASE-2，本模块不自动扩散为全局 middleware。
