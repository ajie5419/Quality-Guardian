# METRIC-GOVERNANCE-001 / PHASE-3B.1

## Activation Approval Evidence Import

The completed human form was validated and imported as append-only Activation Approval Evidence linked to each immutable v1 Version. No Definition Version or Metric status was changed.

| Metric | Decision | Effective Date | Decision By | Activation Note | Evidence Status |
| --- | --- | --- | --- | --- | --- |
| BM-FIRST-PASS-YIELD | APPROVE | 2026-09-01 | 质量管理负责人 | Preserved from form | IMPORTED |
| BM-GROSS-QUALITY-LOSS | APPROVE | 2026-09-01 | 质量管理负责人 | Preserved from form | IMPORTED |
| BM-PROBLEM-CLOSURE-RATE | APPROVED | 2026-09-01 | 质量管理负责人 | Preserved from form | IMPORTED |

### Validation

- Metric Code matched an existing Definition.
- Version `v1` exists and remains immutable.
- Decision is an approval value.
- Effective date, Decision By, Activation Note, Scope Confirmation, and Historical Calculation Confirmation are all present.
- Original source: `docs/metrics/metric-activation-decision-form.md`.
- Evidence is append-only and linked by `metricDefinitionVersionId`.

The evidence import does not activate a Metric. `effectiveFromAt` on the Definition Version was not overwritten; activation remains a separate controlled operation.
