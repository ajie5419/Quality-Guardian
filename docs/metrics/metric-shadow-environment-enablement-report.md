# METRIC-GOVERNANCE-001 / PHASE-6.1

## Real Shadow Environment Enablement Report

**Validation timestamp:** 2026-08-22T06:00:00Z

## Latest local Shadow validation

The repository's local isolated MySQL instance at `127.0.0.1:3307` was used through an explicitly supplied `DATABASE_URL_SHADOW`. A dedicated account `metric_shadow_ro` was created with `SELECT` only on `quality_guard_local_test`. No business-table write was executed.

## Environment validation

| Check | Result | Evidence |
| --- | --- | --- |
| Shadow database URL | READY | Explicit local Shadow URL supplied to the process |
| Database identity | READY | `quality_guard_local_test`, user `metric_shadow_ro@%` |
| Connection status | CONNECTED | `SELECT DATABASE(), CURRENT_USER()` succeeded |
| Read-only permission | PASS | Grants contain `USAGE` and `SELECT` only; no write probe was attempted |
| Required tables | READY | `inspections`, `quality_records`, `quality_loss_index`, `users`, and `departments` exist |
| Adapter registry | AVAILABLE | Four PHASE-6 adapters are registered; policy-pending adapters remain fail-closed |
| DATABASE_URL fallback | NOT USED | The execution guard rejects a missing Shadow URL and does not read `DATABASE_URL` |

## Scope identities

| Scope | Result | Required identity |
| --- | --- | --- |
| ALL | READY | Local Shadow read-only context |
| DEPT | READY | Existing local test identity was read from `users` and its department field |
| SELF | READY | Existing local test identity was read from `users` |

The identities were used only for the local read-only run and were not written to the repository.

## Real Shadow Run

Execution window: `2025-08-01` through `2026-07-31` Scopes: `ALL`, `DEPT`, `SELF` Metrics: `BM-PROBLEM-CLOSURE-RATE`, `BM-SUPPLIER-FINAL-SCORE`, `BM-REINSPECTION-RATE`, `BM-VEHICLE-FAILURE-COUNT`

All 12 executions reached the adapter layer:

| Metric | ALL | DEPT | SELF |
| --- | --- | --- | --- |
| BM-PROBLEM-CLOSURE-RATE | BLOCKED: DATABASE_URL_SHADOW_MISSING | BLOCKED: DATABASE_URL_SHADOW_MISSING, DATASCOPE_IDENTITY_MISSING | BLOCKED: DATABASE_URL_SHADOW_MISSING, DATASCOPE_IDENTITY_MISSING |
| BM-SUPPLIER-FINAL-SCORE | BLOCKED: DATABASE_URL_SHADOW_MISSING | BLOCKED: DATABASE_URL_SHADOW_MISSING, DATASCOPE_IDENTITY_MISSING | BLOCKED: DATABASE_URL_SHADOW_MISSING, DATASCOPE_IDENTITY_MISSING |
| BM-REINSPECTION-RATE | BLOCKED: DATABASE_URL_SHADOW_MISSING | BLOCKED: DATABASE_URL_SHADOW_MISSING, DATASCOPE_IDENTITY_MISSING | BLOCKED: DATABASE_URL_SHADOW_MISSING, DATASCOPE_IDENTITY_MISSING |
| BM-VEHICLE-FAILURE-COUNT | BLOCKED: DATABASE_URL_SHADOW_MISSING | BLOCKED: DATABASE_URL_SHADOW_MISSING, DATASCOPE_IDENTITY_MISSING | BLOCKED: DATABASE_URL_SHADOW_MISSING, DATASCOPE_IDENTITY_MISSING |

`BM-PROBLEM-CLOSURE-RATE` reached the real service but was blocked by `Cannot access 'InspectionCoreService' before initialization`. The other three metrics were blocked by their still-pending business policies: supplier score policy, reinspection revision policy, and vehicle failure event policy. No `MATCH` was generated and no result was fabricated.

## Blocking actions

1. Fix the `InspectionCoreService` initialization cycle before rerunning problem closure.
2. Obtain business approval for the three pending metric policies.
3. Re-run the same fixed-window execution and persist evidence only for successful calculations.

No consumer cutover, policy change, migration, seed, or historical-data write was performed.
