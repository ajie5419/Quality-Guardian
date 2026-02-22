# QMS Frontend Audit Baseline

Updated: 2026-02-22

## Scope

Core modules:

1. work-order
2. planning
3. inspection
4. after-sales
5. supplier
6. outsourcing
7. knowledge
8. vehicle-commissioning
9. reports

## Module Audit Matrix

| Module | Main Page | Lines | Split Status | API Consumption Status | Priority |
| --- | --- | --: | --- | --- | --- |
| work-order | `views/qms/work-order/index.vue` | 405 | Sufficient | Partial normalized | P2 |
| planning | `views/qms/planning/*/index.vue` | 358-506 | Partial | Partial normalized | P2 |
| inspection (issues) | `views/qms/inspection/issues/index.vue` | 655 | Needs split | Mixed | P0 |
| after-sales | `views/qms/after-sales/index.vue` | 805 | Needs split | Mixed | P0 |
| supplier | `views/qms/supplier/index.vue` | 380 | Partial | Mixed | P1 |
| outsourcing | `views/qms/outsourcing/index.vue` | 370 | Weak split | Unknown/mixed | P2 |
| knowledge | `views/qms/knowledge/index.vue` | 719 | Needs split | Mixed | P1 |
| vehicle-commissioning | `views/qms/vehicle-commissioning/index.vue` | 712 | Needs split | Mixed | P0 |
| reports (summary) | `views/qms/reports/summary/index.vue` | 599 | Needs split | Mixed | P1 |

Split Status definitions:

- `Sufficient`: module already has stable `components + composables`, index size acceptable.
- `Partial`: module has split structure but still has mixed orchestration/business logic.
- `Needs split`: major mixed responsibilities and oversized index page.
- `Weak split`: almost no reusable boundaries.

## Duplicate Logic Checklist

High-frequency duplicated logic detected:

1. List request normalization (`items/total`, array fallback).
2. Import/export flow state handling.
3. Status/severity display mapping in page layer.
4. Error handling and message style (`console.error + message.error`).
5. Table filter + pagination + reload orchestration.

## No-Repeat Split List

Do not re-split these areas unless behavior changes:

1. `views/qms/work-order/components/*`
2. `views/qms/planning/components/*`
3. `views/qms/after-sales/components/*` (existing modal/form decomposition)
4. `views/qms/inspection/issues/composables/*` (existing action/data/chart composables)
5. `views/qms/supplier/composables/useSupplierActions.ts`

Instead of re-splitting above files, prioritize:

1. index page orchestration extraction
2. API adapter normalization
3. error handling consistency

## Current Rule Gate

Enforced by `AGENTS.md` and `scripts/check-qms-architecture.sh`:

1. no `requestClient` in `views/qms/**`
2. index line threshold for changed files
3. mandatory checks before submission
