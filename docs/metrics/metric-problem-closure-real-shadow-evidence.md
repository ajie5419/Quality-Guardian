# METRIC-GOVERNANCE-001 / PHASE-6.2

## BM-PROBLEM-CLOSURE-RATE Real Shadow Evidence

Execution window: `2025-08-01T00:00:00.000Z` to `2026-07-31T23:59:59.999Z` Version: `v1` Environment: local isolated Shadow MySQL `quality_guard_local_test` through the dedicated read-only account Identity: local test user `USR-1768918985768`, department `dept-1769576649586`

| Scope | Legacy Result | Canonical Result | Diff | Classification |
| ----- | ------------: | ---------------: | ---- | -------------- |
| ALL   |        `null` |           `null` | none | MATCH          |
| DEPT  |        `0.75` |           `0.75` | none | MATCH          |
| SELF  |        `0.75` |           `0.75` | none | MATCH          |

The adapter now imports `InspectionIssueStatsService` directly from the query layer. It no longer imports the inspection module barrel, which previously re-entered `InspectionCoreService` during module initialization. No mock data, copied SQL, policy change, consumer cutover, or historical backfill was used.

`null` for ALL is the real zero-denominator result and is preserved as null rather than converted to zero.
