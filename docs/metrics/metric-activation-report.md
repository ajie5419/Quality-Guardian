# METRIC-GOVERNANCE-001 / PHASE-3A

## Canonical Metric Activation

Activation readiness was checked against the local Registry database `quality_guard_local_test`. The Registry tables exist, but no Definition rows were found for the three requested metric codes. Without a persisted Definition/Version and its linked evidence, the activation service cannot satisfy the readiness gate and no status mutation was attempted.

| Metric Code | Previous Status | New Status | Version | Approval Evidence | Shadow Evidence | Activation Timestamp | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BM-FIRST-PASS-YIELD | DRAFT (not found in local Registry) | DRAFT | unavailable | BLOCKED: Definition/Version record missing | Available in PHASE-2E evidence document, not linked to a Registry Version | — | BLOCKED |
| BM-GROSS-QUALITY-LOSS | DRAFT (not found in local Registry) | DRAFT | unavailable | BLOCKED: Definition/Version record missing | Available in PHASE-2D evidence document, not linked to a Registry Version | — | BLOCKED |
| BM-PROBLEM-CLOSURE-RATE | DRAFT (not found in local Registry) | DRAFT | unavailable | BLOCKED: Definition/Version record missing | Available in PHASE-2D evidence document, not linked to a Registry Version | — | BLOCKED |

### Readiness Gate

All three candidates are `BLOCKED` because the local database contains no persisted Definition/Version rows for these codes. Consequently, Approval Evidence, Owner Assignment, Policy Dependency resolution, and Shadow Evidence cannot be joined to a current immutable Version. CAS activation and audit were not invoked.

No Dashboard, Report, Projection, historical data, business calculation, or Metric status was modified.
