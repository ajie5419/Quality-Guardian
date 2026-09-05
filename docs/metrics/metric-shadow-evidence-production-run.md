# METRIC-GOVERNANCE-001 / PHASE-2D

## Real Shadow Evidence Production Run

The original three-metric run completed against the local read-only Shadow database `quality_guard_local_test` on `qms-container-mysql:3307`. This record is retained as the execution context; the first-pass diff was resolved and revalidated in PHASE-2E.

- Window: `2025-08-01..2026-07-31`
- Version: `v1`
- Scopes: `ALL`, `DEPT`, `SELF`
- No production access, business-table writes, migration, seed, or activation.

PHASE-2E revalidation details are recorded in [metric-shadow-resolution.md](./metric-shadow-resolution.md).
