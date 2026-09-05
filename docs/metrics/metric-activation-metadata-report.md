# METRIC-GOVERNANCE-001 / PHASE-2G

## Activation Metadata Completion

Shadow Validation Evidence is now persisted as append-only rows linked to each immutable v1 Version. Each row contains metric code, version, fixed execution window, scope, current/canonical result, and classification.

| Metric | Version | Shadow Evidence Link | effectiveFromAt | Readiness Result |
| --- | --- | --- | --- | --- |
| BM-FIRST-PASS-YIELD | v1 | 3 persisted rows (`ALL`, `DEPT`, `SELF`) → `metric_shadow_validation_evidences` | `NULL` | BLOCKED |
| BM-GROSS-QUALITY-LOSS | v1 | 3 persisted rows (`ALL`, `DEPT`, `SELF`) → `metric_shadow_validation_evidences` | `NULL` | BLOCKED |
| BM-PROBLEM-CLOSURE-RATE | v1 | 3 persisted rows (`ALL`, `DEPT`, `SELF`) → `metric_shadow_validation_evidences` | `NULL` | BLOCKED |

### Evidence Contract

- Window: `2025-08-01..2026-07-31`
- Scopes: `ALL`, `DEPT`, `SELF`
- Classification: `MATCH` for all persisted rows
- Source: `docs/metrics/metric-shadow-evidence-production-run.md` and PHASE-2E resolution record
- Evidence rows are append-only and uniquely tied to Definition Version, window, and scope.

### Effective Date Decision

No human-approved effective date is present in the repository or local Registry. `effectiveFromAt` therefore remains `NULL`; no date was inferred and all three metrics remain `DRAFT` / `BLOCKED`.

Definition, Version, Approval Evidence, historical data, business calculations, and consumers were not modified. Metric Activation was not executed.
