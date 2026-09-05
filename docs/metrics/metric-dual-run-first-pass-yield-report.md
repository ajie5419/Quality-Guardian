# METRIC-GOVERNANCE-001 / PHASE-4C

## Canonical Metric Dual Run — First Pass Yield

The dual-run service executed Legacy and Canonical calculations without changing the active consumer path. Dashboard KPI, Analytics API, and Report continue to use the Legacy Result; Canonical Result is validation-only.

| Consumer | Scope | Legacy Result | Canonical Result | Diff Classification | Evidence |
| --- | --- | --: | --: | --- | --- |
| Dashboard KPI / Analytics API / Report | ALL | 99.96 | 99.95880078595424 | MATCH (two-decimal display precision) | Persisted Shadow/Dual-Run Evidence |
| Dashboard KPI / Analytics API / Report | DEPT | NULL | NULL | MATCH | Persisted Shadow/Dual-Run Evidence |
| Dashboard KPI / Analytics API / Report | SELF | NULL | NULL | MATCH | Persisted Shadow/Dual-Run Evidence |

### Runtime Boundary

- Legacy Result remains the only user-facing result.
- Canonical Result is calculated and persisted for validation only.
- Diff classifications supported: `MATCH`, `MINOR_DIFF`, `BUSINESS_REVIEW_REQUIRED`, `BLOCKED`.
- Existing Legacy Calculation was not removed or modified.
- ACTIVE Metric status and historical values were not changed.

### Rollback

Disable the dual-run evidence job/adapter. Existing Dashboard, Analytics API, and Report paths remain unchanged, so rollback does not require consumer code changes.
