# METRIC-GOVERNANCE-001 / PHASE-2F

## Canonical Metric Materialization

The approved canonical definitions were materialized into the local Registry as immutable `DRAFT/v1` records. The existing finalization service was used; it is idempotent, preserves versions, writes owner/approval/policy records, and does not activate definitions.

| Metric Code | Definition ID | Version ID | Evidence Links | Owner | Policy Dependency | Current Status |
| --- | --- | --- | --- | --- | --- | --- |
| BM-FIRST-PASS-YIELD | `cmt3nan7m00008zn0y6s3t54p` | `cmt3nan7n00048zn0xv04i2uw` | Approval: `docs/metrics/metric-approval-sheet.md#final-human-decision-record`; Shadow: `docs/metrics/metric-shadow-resolution.md` | 品质部 | None pending | DRAFT / v1 |
| BM-GROSS-QUALITY-LOSS | `cmt3nan8m000c8zn0vp2p6p5b` | `cmt3nan8m000g8zn04xn61pt0` | Approval: `docs/metrics/metric-approval-sheet.md#final-human-decision-record`; Shadow: `docs/metrics/metric-shadow-evidence-production-run.md` | 财务与品质联合 | None pending | DRAFT / v1 |
| BM-PROBLEM-CLOSURE-RATE | `cmt3nan8z000u8zn00hs3u7xb` | `cmt3nan8z000y8zn0gxv68pr0` | Approval: `docs/metrics/metric-approval-sheet.md#final-human-decision-record`; Shadow: `docs/metrics/metric-shadow-evidence-production-run.md` | 品质部 | None pending | DRAFT / v1 |

### Governance Evidence

- Approval Evidence rows were created from D01, D03, and D04 with `decisionBy = Human Business Approval`.
- Business Owner assignments were created with `CONFIRMED_FROM_APPROVAL`; Policy and Data Owner labels remain `UNKNOWN` and unconfirmed.
- No pending Policy Dependency was created for these three approved metrics.
- Shadow evidence remains an immutable document evidence link. It is not copied into a formula or business-value field.
- All three Definition Versions remain immutable `v1`; no effective date was set and no Metric was activated.

### Canonical Lineage

The finalization service attempted legacy-to-canonical lineage creation. The local Registry contains no legacy Definition rows for `BM-PASS-RATE`, `BM-QUALITY-LOSS-TREND`, or the legacy problem-closure code, so no fabricated lineage rows were inserted. Lineage is therefore recorded as pending legacy Registry materialization rather than inferred from names.

No Dashboard, Report, Projection, historical data, or business calculation was modified.
