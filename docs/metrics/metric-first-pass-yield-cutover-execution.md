# METRIC-GOVERNANCE-001 / PHASE-4E

## First Pass Yield Consumer Cutover Execution

### Cutover Result

The Analytics consumer boundary now has a Canonical Metric Adapter with an explicit Legacy rollback path. Dashboard and Report consumers were not changed.

| Consumer | Forward Path | Rollback Path | User-facing State |
| --- | --- | --- | --- |
| Analytics API adapter | Legacy Consumer → `BM-FIRST-PASS-YIELD` Canonical Adapter | Canonical Adapter → Legacy Result | Adapter is available; existing API output remains unchanged until its controlled caller enables the flag |
| Dashboard | Not changed | Legacy remains | Legacy Result |
| Report | Not changed | Legacy remains | Legacy Result |

### Adapter Contract

- `useCanonical = true`: returns the persisted Canonical calculation result and retains Dual Run Evidence.
- `useCanonical = false`: calls the existing Legacy calculation and returns the Legacy Result.
- Both paths preserve the `BM-FIRST-PASS-YIELD` result contract and NULL empty-population policy.
- No Legacy Calculation was deleted or modified.

### Safety Boundary

No Dashboard or Report display switch was performed. No Metric Definition, ACTIVE Version, historical data, or consumer query was modified. The adapter can be rolled back by selecting the Legacy path without data or schema rollback.
