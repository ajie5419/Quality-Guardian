# METRIC-GOVERNANCE-001 / PHASE-4D

## First Pass Yield Consumer Cutover Readiness

This document prepares a future consumer cutover. Dashboard, Analytics API, and Report continue to expose the Legacy Result; no user output or Legacy Calculation was changed.

### Dual Run Observation Summary

| Execution Window | Scope | Legacy Result | Canonical Result | Diff Classification |
| --- | --- | --: | --: | --- |
| 2025-08-01..2026-07-31 | ALL | 99.96 | 99.95880078595424 | MATCH at two-decimal display precision |
| 2025-08-01..2026-07-31 | DEPT | NULL | NULL | MATCH |
| 2025-08-01..2026-07-31 | SELF | NULL | NULL | MATCH |

Observation evidence remains persisted and traceable to `BM-FIRST-PASS-YIELD` v1. The fixed window and all three DataScope modes were covered.

### Cutover Readiness Gate

| Gate | Requirement | Decision |
| --- | --- | --- |
| Evidence completeness | ALL, DEPT, and SELF evidence exists for the same window and version | Required |
| MATCH threshold | 100% of observed scopes are `MATCH`; display precision policy is applied | Required; currently satisfied |
| Minor difference | Any `MINOR_DIFF` requires an approved tolerance and documented resolution | Blocks cutover until approved |
| Business review | Any `BUSINESS_REVIEW_REQUIRED` requires owner decision and resolution evidence | Blocks cutover |
| Blocked handling | Any `BLOCKED` result prevents cutover and keeps Legacy as the sole user-facing result | Required; currently clear |
| Scope parity | Legacy and Canonical use equivalent ALL/DEPT/SELF identity and filtering | Required |
| Rollback | Adapter flag can return all consumers to Legacy without schema or data rollback | Required |

### Adapter Integration Design

| Consumer | Adapter Boundary | Cutover Behavior | Rollback |
| --- | --- | --- | --- |
| Dashboard KPI | Resolve Canonical `BM-FIRST-PASS-YIELD` after the existing scoped query boundary | Feature flag selects Canonical only after the gate passes | Flag off restores Legacy Result |
| Analytics API | Map Canonical result to the existing `passRate` response contract; preserve NULL semantics | Dual-read comparison first, then controlled response switch | Return Legacy mapping |
| Report | Read Canonical through an adapter behind the existing report service | Keep report shape and formatting stable; switch only after consumer approval | Disable adapter and retain Legacy calculation |

### Non-Negotiable Boundaries

- Legacy Calculation remains in place.
- Dual Run Evidence remains append-only.
- No Dashboard, API, or Report switch is authorized by this document.
- No historical recalculation or Metric Definition change is required for cutover preparation.
