# METRIC-GOVERNANCE-001 / PHASE-2C.2

## Real Shadow Execution Run

### Fixed Execution Window

- `startDate`: `2025-08-01`
- `endDate`: `2026-07-31`
- `metricVersion`: `v1`

### Preflight Result

本次运行前检查发现当前进程未提供 `DATABASE_URL_SHADOW`。按照 PHASE-2C.1 的 fail-closed 规则，所有执行均为 `BLOCKED`，不执行任何数据库查询，不生成推测数值。

### Evidence Matrix

| metricCode | metricVersion | executionWindow | scope | currentResult | canonicalResult | diff | classification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BM-GROSS-QUALITY-LOSS | v1 | 2025-08-01..2026-07-31 | ALL | unavailable | unavailable | DATABASE_URL_SHADOW_MISSING | BLOCKED |
| BM-GROSS-QUALITY-LOSS | v1 | 2025-08-01..2026-07-31 | DEPT | unavailable | unavailable | DATABASE_URL_SHADOW_MISSING | BLOCKED |
| BM-GROSS-QUALITY-LOSS | v1 | 2025-08-01..2026-07-31 | SELF | unavailable | unavailable | DATABASE_URL_SHADOW_MISSING | BLOCKED |
| BM-FIRST-PASS-YIELD | v1 | 2025-08-01..2026-07-31 | ALL | unavailable | unavailable | DATABASE_URL_SHADOW_MISSING | BLOCKED |
| BM-FIRST-PASS-YIELD | v1 | 2025-08-01..2026-07-31 | DEPT | unavailable | unavailable | DATABASE_URL_SHADOW_MISSING | BLOCKED |
| BM-FIRST-PASS-YIELD | v1 | 2025-08-01..2026-07-31 | SELF | unavailable | unavailable | DATABASE_URL_SHADOW_MISSING | BLOCKED |
| BM-PROBLEM-CLOSURE-RATE | v1 | 2025-08-01..2026-07-31 | ALL | unavailable | unavailable | DATABASE_URL_SHADOW_MISSING | BLOCKED |
| BM-PROBLEM-CLOSURE-RATE | v1 | 2025-08-01..2026-07-31 | DEPT | unavailable | unavailable | DATABASE_URL_SHADOW_MISSING | BLOCKED |
| BM-PROBLEM-CLOSURE-RATE | v1 | 2025-08-01..2026-07-31 | SELF | unavailable | unavailable | DATABASE_URL_SHADOW_MISSING | BLOCKED |

No metric was activated and no business data was changed.
