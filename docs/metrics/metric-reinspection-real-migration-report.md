# METRIC-GOVERNANCE-001 / PHASE-6.3

## BM-REINSPECTION-RATE Real Migration Execution

### Legacy source inventory

| Surface | Source | Current behavior |
| --- | --- | --- |
| Backend calculation | `apps/backend/modules/inspection/inspection-request-stats.service.ts` | Builds department/team/supplier reinspection aggregates from request statistics |
| Event derivation | `inspection-request-stats-identity.ts#createReinspectionRows` | Derives `reinspectionCount / inspectedCount` presentation rows |
| Dashboard | `InspectionDashboardHistoryCard.vue`, `InspectionDashboardRankCards.vue` | Displays team/supplier/department reinspection rates and distribution ratios |
| Canonical adapter | `metric-reinspection-adapter.ts` | Registered, but fail-closed until revision and deduplication policy is approved |

### Policy validation

| Policy item | Status | Reason |
| --- | --- | --- |
| Revision key | BLOCKED_POLICY | No approved stable request revision key is persisted |
| Deduplication rule | BLOCKED_POLICY | No approved request-level deduplication rule is persisted |
| Reinspection event definition | BLOCKED_POLICY | D06 only approves request-level priority and explicitly forbids automatic fallback |

The repository proposes `requestId + revision` and one event per request, but this remains a proposal and was not treated as an approval.

### Real Shadow Run

Environment: local isolated `quality_guard_local_test`, explicit read-only Shadow account Window: `2025-08-01T00:00:00.000Z` to `2026-07-31T23:59:59.999Z` Scopes: `ALL`, `DEPT`, `SELF` Version: `v1`

| Scope | Legacy Result | Canonical Result | Diff        | Classification |
| ----- | ------------- | ---------------- | ----------- | -------------- |
| ALL   | unavailable   | unavailable      | unavailable | BLOCKED_POLICY |
| DEPT  | unavailable   | unavailable      | unavailable | BLOCKED_POLICY |
| SELF  | unavailable   | unavailable      | unavailable | BLOCKED_POLICY |

The execution reached the registered adapter and stopped at `REINSPECTION_REVISION_POLICY_PENDING`. No query result was fabricated, and no `MATCH` was emitted.

### Consumer validation

Consumer cutover: **NOT READY** Reason: the canonical event, revision key, and deduplication policy are not approved. Legacy Dashboard behavior remains unchanged.

No Metric Policy, Definition, Version, Dashboard, Report, historical data, or consumer state was modified.
