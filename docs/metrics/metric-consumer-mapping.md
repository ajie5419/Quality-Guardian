# METRIC-GOVERNANCE-001 / PHASE-4A

## Canonical Metric Consumer Mapping

This is a read-only repository scan after activation of the three Canonical Metrics. No consumer, formula, query, or historical value was changed.

| Area | Consumer | Legacy Calculation / Formula Source | Registry Reference | Classification | Migration Risk |
| --- | --- | --- | --- | --- | --- |
| Report / Analytics API | `getLegacyInspectionPassRateSummaryByRange` in `apps/backend/modules/report/pass-rate.ts` | `SUM(quantity)` grouped by pass/unqualified status; `passRate = roundPercent(passCount / totalCount * 100)`, empty denominator returns `0` | No | DIRECT_LEGACY_CALCULATION | High: zero-denominator policy and scope semantics must be preserved |
| Report / Projection | `pass-rate-projection-query.ts` | SQL quantity aggregation; `passRate = roundPercent(passCount / totalCount * 100)`; empty denominator returns `0` | No | DIRECT_LEGACY_CALCULATION | High: projection consumers must not be changed in discovery phase |
| Report / Reconciliation | `pass-rate-shadow-reconciliation.service.ts` | Calls legacy pass-rate summary and compares projection rows | No | NEEDS_MIGRATION | High: reconciliation contract depends on legacy result shape |
| Dashboard | `dashboard.service.ts#getMonthlyTrend` | Aggregates inspection summaries and derives `passRate`; no Canonical Code lookup | No | DIRECT_LEGACY_CALCULATION | High: dashboard migration explicitly deferred |
| Frontend Metric Display | `MonthlyReportContent.vue` and report KPI components | Displays API `passRate`, trend, target comparison, and formatted percent | No | NEEDS_MIGRATION | Medium: display contract must handle Canonical NULL and precision policy |
| Problem Analytics API | `inspection-issue-stats.service.ts` | `closedCount / totalCount * 100`, rounded; empty population returns `0` | No | DIRECT_LEGACY_CALCULATION | High: Canonical NULL policy and approved population need migration mapping |
| Dashboard / Problem Display | Inspection issue statistics consumers | Consumes `totalCount`, `closedCount`, and derived percentage from issue stats | No | NEEDS_MIGRATION | High: API shape and empty-population semantics are legacy |
| Quality Loss Dashboard / Analytics | `QualityLossService` reporting methods and `quality_loss_index` reads | Sums `totalAmount` from materialized `quality_loss_index` by period and scope | No | DIRECT_LEGACY_CALCULATION | High: gross/net/recovery split is not represented by a Registry lookup |
| Quality Loss Export | `quality-loss-export.get.service.ts` | Exports quality-loss records/index rows; no Canonical Code | No | NEEDS_MIGRATION | Medium: export meaning must be mapped to gross/net/recovery before migration |
| Scheduled Jobs | `maintenance:quality-loss-index:enqueue` / `drain` | Maintains the materialized source index; does not calculate a Registry Metric | No | UNKNOWN | Medium: infrastructure dependency, not itself a canonical consumer |
| Registry APIs | `metric-governance` service/readiness endpoints | Reads Definition/Version/Evidence metadata only | Yes | REGISTRY_READY | Low: metadata consumer already uses Registry |

### Summary by Canonical Metric

| Metric | Direct Legacy Consumers | Registry-ready Consumers | Migration Required |
| --- | --- | --- | --- |
| BM-FIRST-PASS-YIELD | Report, Projection, Dashboard, frontend KPI | Registry governance APIs only | Yes |
| BM-GROSS-QUALITY-LOSS | Quality-loss dashboard, analytics, export | Registry governance APIs only | Yes |
| BM-PROBLEM-CLOSURE-RATE | Inspection issue statistics and displays | Registry governance APIs only | Yes |

### Discovery Boundary

- No Dashboard, Report, Projection, Analytics API, Scheduled Job, Export, or frontend display was migrated.
- No existing consumer currently resolves a Canonical Metric by `metricCode` from the Metric Registry, except governance metadata APIs.
- `quality_loss_index` maintenance is a source-materialization dependency, not proof that a consumer is Registry-ready.
- Classification `UNKNOWN` means the scan found an adjacent dependency but could not prove it publishes or consumes one of the three Canonical Metrics.
