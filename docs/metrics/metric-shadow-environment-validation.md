# METRIC-GOVERNANCE-001 / PHASE-2C.3

## Shadow Data Environment Validation

### Database Identity

本次验证只接受独立 `DATABASE_URL_SHADOW`。禁止从 `DATABASE_URL` 回退，也不输出连接串或凭据。

- Database Identity: `UNAVAILABLE`
- Connection Status: `BLOCKED`
- Readonly Verification: `BLOCKED`
- Available Tables: `[]`
- Unavailable Dependencies: `DATABASE_URL_SHADOW_MISSING`, `READONLY_CONNECTION_CHECK_UNAVAILABLE`
- Validation Timestamp: 2026-08-21

当前运行环境未提供 Shadow 连接，因此未连接任何数据库，未执行写操作、migration 或 seed。

### Validation Contract

环境通过必须同时满足：

1. `DATABASE_URL_SHADOW` 存在；
2. 连接目标是独立 Shadow Database；
3. 数据库用户只读权限验证通过；
4. 三项 Metric Adapter 可访问；
5. 所需来源表可读取。

任何条件失败均为 `BLOCKED`，不得 fallback 到 `DATABASE_URL`，不得生成 Shadow 数值或 Evidence。

### Subsequent Run Gate

环境验证通过后，才允许重新执行 PHASE-2C.2：

- Metrics: `BM-GROSS-QUALITY-LOSS`, `BM-FIRST-PASS-YIELD`, `BM-PROBLEM-CLOSURE-RATE`
- Window: `2025-08-01` 至 `2026-07-31`
- Scope: `ALL`, `DEPT`, `SELF`

本阶段不激活 Metric，不迁移 Dashboard、Report 或 Projection。
