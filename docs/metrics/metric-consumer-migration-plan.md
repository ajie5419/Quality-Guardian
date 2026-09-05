# METRIC-GOVERNANCE-001 / PHASE-4B

## Canonical Metric Consumer Migration Plan

This plan is derived from `docs/metrics/metric-consumer-mapping.md`. It is a design-only artifact: no consumer, query, formula, historical value, or Metric status was changed.

| Consumer Name | Current Calculation | Current Data Source | Target Canonical Metric | Migration Strategy | Risk Level | Rollback Strategy |
| --- | --- | --- | --- | --- | --- | --- |
| `getLegacyInspectionPassRateSummaryByRange` | `roundPercent(passCount / totalCount * 100)`; empty denominator currently `0` | Inspection quantity/status SQL aggregation | BM-FIRST-PASS-YIELD | DUAL_RUN_REQUIRED | High | Feature-flag the adapter off and continue the unchanged legacy function |
| `pass-rate-projection-query.ts` | Quantity aggregation with rounded pass rate; empty denominator `0` | Projection tables plus inspection quantity/status | BM-FIRST-PASS-YIELD | ADAPTER_LAYER | High | Stop canonical adapter reads and retain projection query output |
| `pass-rate-shadow-reconciliation.service.ts` | Compares legacy pass-rate summary with projection values | Legacy summary + projection rows | BM-FIRST-PASS-YIELD | DUAL_RUN_REQUIRED | High | Disable canonical comparison and preserve existing reconciliation report |
| `dashboard.service.ts#getMonthlyTrend` | Derives monthly pass rate from pass/pass-total aggregates | Inspection reporting aggregates | BM-FIRST-PASS-YIELD | ADAPTER_LAYER | High | Restore legacy monthly aggregation behind the migration switch |
| `MonthlyReportContent.vue` and report KPI components | Formats API `passRate`, trend, and target comparison | Report summary/trend API response | BM-FIRST-PASS-YIELD | DIRECT_REPLACE | Medium | Revert the API field binding; retain the existing display formatter |
| `inspection-issue-stats.service.ts` | `round(closedCount / totalCount * 100)`; empty population `0` | Inspection issue counts and closed-status query | BM-PROBLEM-CLOSURE-RATE | DUAL_RUN_REQUIRED | High | Keep legacy issue-stat response and disable Canonical comparison |
| Inspection issue dashboard/display consumers | Displays `totalCount`, `closedCount`, and derived percentage | Inspection issue statistics API | BM-PROBLEM-CLOSURE-RATE | ADAPTER_LAYER | High | Re-enable the legacy response mapping without changing stored issues |
| Quality Loss dashboard reporting | Sums `totalAmount` by period and scope | Materialized `quality_loss_index` | BM-GROSS-QUALITY-LOSS | DUAL_RUN_REQUIRED | High | Switch dashboard reads back to the legacy reporting service |
| Quality Loss analytics endpoints | Period/group aggregation of loss amounts | `quality_loss_index` and scoped reporting queries | BM-GROSS-QUALITY-LOSS | ADAPTER_LAYER | High | Disable Canonical adapter and retain existing endpoint payload |
| `quality-loss-export.get.service.ts` | Exports loss/index rows without gross/net/recovery distinction | Quality-loss records and index | BM-GROSS-QUALITY-LOSS | LEGACY_KEEP | Medium | No rollback needed; keep export unchanged until a separately approved export contract exists |
| `quality-loss-index` enqueue/drain jobs | Maintains materialized source rows; not a KPI formula | `quality_loss_index_jobs` and source loss records | Supporting dependency for BM-GROSS-QUALITY-LOSS | LEGACY_KEEP | Medium | Stop only the Canonical consumer adapter; do not disable source-index maintenance |

### Strategy Rules

- `DIRECT_REPLACE` is allowed only where the consumer contract already matches the Canonical unit, NULL policy, scope, and precision.
- `ADAPTER_LAYER` is the default for API and dashboard consumers whose response shape must remain backward compatible.
- `DUAL_RUN_REQUIRED` is mandatory for pass rate, problem closure, and gross loss because their legacy formulas and empty-population semantics differ from Canonical definitions.
- `LEGACY_KEEP` applies to source maintenance or exports whose business contract has not been approved for migration.

### Migration Gates

Before any implementation phase, each consumer must have approved DataScope parity, NULL/precision behavior, historical replay evidence, feature-flag rollback, and an owner sign-off. This document does not authorize consumer migration.
