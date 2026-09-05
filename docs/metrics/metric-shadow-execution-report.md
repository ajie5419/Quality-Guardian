# METRIC-GOVERNANCE-001 / PHASE-2C

## Controlled Shadow Execution & Business Reconciliation

### Execution Window

默认窗口为最近 12 个月：`[now - 12 months, now)`。执行器支持传入明确 `start`/`end`，所有结果必须记录 ISO 时间范围。

### Scope Matrix

每个指标必须分别执行 `ALL`、`DEPT`、`SELF`。Scope 由来源模块自己的 `AnalyticsAccessContext` 解析；缺少用户或范围时 fail-closed 为 `BLOCKED`，不得降级为全量查询。

### Controlled Run Result

本次工作树执行环境未提供 `DATABASE_URL`，因此无法安全连接真实数据源。按照 fail-closed 规则，本轮不伪造 Current/Canonical 数值，结果登记为 `BLOCKED`，等待具备受控只读数据库与 DataScope 身份后运行。

| Metric | Window | Current Result | Canonical Result | Diff | Classification | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| BM-GROSS-QUALITY-LOSS | recent 12 months | unavailable | unavailable | source unavailable | BLOCKED | 不进入激活 |
| BM-FIRST-PASS-YIELD | recent 12 months | unavailable | unavailable | source unavailable | BLOCKED | 不进入激活 |
| BM-PROBLEM-CLOSURE-RATE | recent 12 months | unavailable | unavailable | source unavailable | BLOCKED | 不进入激活 |

### Business Review Record

当分类为 `BUSINESS_REVIEW_REQUIRED` 时，必须追加以下记录后才能完成对账：

| Issue | Owner | Reason | Resolution |
| --- | --- | --- | --- |
| 待真实窗口执行 | 指标业务 Owner | 当前无可用只读数据源 | 先完成 ALL/DEPT/SELF 三范围 Snapshot，再由业务 Owner 确认差异 |

### Activation Gate

Metric 进入 `ACTIVE` 前必须同时具备：

1. Approval Evidence
2. Shadow Execution Evidence（窗口、Scope、Current、Canonical、Diff、Classification、Resolution）

本报告中的 `BLOCKED` 结果不构成 Shadow Execution Evidence，不允许激活。
