# METRIC-GOVERNANCE-001 / PHASE-2E

## Shadow Diff Resolution

| Diff Item | Root Cause | Business Decision | Resolution |
| --- | --- | --- | --- |
| `BM-FIRST-PASS-YIELD` DEPT/SELF: current `0`, canonical `null` | The legacy summary exposes `0` when the scoped denominator is empty; the canonical definition treats an empty population as no result. | An empty denominator is not a measured zero. The metric result is `NULL`. | Shadow adapter normalization now emits `null` for both current and canonical results when `totalCount = 0`. The underlying business calculation and consumer output were not changed. |
| `BM-FIRST-PASS-YIELD` ALL: `99.96` vs `99.95880078595424` | The current path rounds for presentation while the canonical path retains full precision. | Display precision is two decimal places; stored/calculated evidence retains raw values for traceability. | Shadow comparison uses two-decimal display precision for classification. The result is `MATCH` at display precision; raw values remain in the evidence. |

### Revalidation Scope

- Metric: `BM-FIRST-PASS-YIELD`
- Window: `2025-08-01..2026-07-31`
- Scopes: `ALL`, `DEPT`, `SELF`
- Environment: local read-only Shadow database `quality_guard_local_test`

### Revalidation Evidence

| Scope | Current Result | Canonical Result | Classification |
| --- | --: | --: | --- |
| ALL | `99.96` | `99.95880078595424` | `MATCH` at two-decimal display precision |
| DEPT | `null` | `null` | `MATCH` |
| SELF | `null` | `null` | `MATCH` |

No Metric was activated and no Dashboard, Report, Projection, business calculation, or historical data was modified.
