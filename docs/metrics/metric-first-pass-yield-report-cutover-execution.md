# METRIC-GOVERNANCE-001 / PHASE-4H

## First Pass Yield Report Consumer Cutover Execution

### 切换结果

`BM-FIRST-PASS-YIELD` Report Consumer 已接入 Canonical Adapter。报告汇总默认使用 Canonical Result；设置 `METRIC_FIRST_PASS_REPORT_CANONICAL=false` 即回滚到 Legacy Result。

本次范围仅为 First Pass Yield Report，不影响其他 Metric Consumer。

### 执行记录

| 项目                   | 结果                                         |
| ---------------------- | -------------------------------------------- |
| Metric                 | BM-FIRST-PASS-YIELD                          |
| Version                | v1                                           |
| Consumer               | ReportSummaryService / Quality Summary       |
| Forward                | Report Consumer → Canonical Metric Adapter   |
| Rollback               | Canonical Adapter → Legacy Result            |
| Cutover Time           | 每次 Canonical 请求写入 audit log 的执行时间 |
| Rollback Configuration | `METRIC_FIRST_PASS_REPORT_CANONICAL=false`   |
| Legacy Calculation     | 保留                                         |
| Dual Run Evidence      | 保留并继续持久化                             |

### 审计内容

每次启用 Canonical 的报告请求写入 `metric_consumer_cutover` audit record，记录：

- `BM-FIRST-PASS-YIELD`
- Legacy Result
- Canonical Result
- Rollback Configuration
- 执行时间（audit log timestamp）

### 既有对账证据

窗口 `2025-08-01` 至 `2026-07-31`：

| Scope | Legacy |         Canonical | Classification           |
| ----- | -----: | ----------------: | ------------------------ |
| ALL   |  99.96 | 99.95880078595424 | MATCH（按 2 位展示精度） |
| DEPT  |   NULL |              NULL | MATCH                    |
| SELF  |   NULL |              NULL | MATCH                    |

### 边界

- 未修改历史报告。
- 未修改 Metric Definition、ACTIVE Version 或历史 Evidence。
- 未删除 Legacy Logic。
- 未切换其他 Metric Consumer。
