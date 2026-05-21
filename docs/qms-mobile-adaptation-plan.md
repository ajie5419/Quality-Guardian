# QMS Mobile Adaptation Plan

## Scope

This document defines a system-wide mobile adaptation baseline for the QMS frontend (`apps/web-antd`) to ensure new features remain mobile-friendly by default.

## Baseline Rules

1. Viewport and safe area

- Keep `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />`.
- Add global safe-area padding helpers for top/bottom bars and modal footers.

2. Layout shell

- Mobile pages should use a dedicated shell component with:
  - horizontal padding (`12px-16px`)
  - vertical spacing (`12px-16px`)
  - overflow-safe containers for tables/cards
- Avoid directly placing dense table/filter toolbars at page root.

3. Popup strategy (Modal/Drawer)

- Use a shared adaptive hook for popup width/wrapper class.
- On mobile:
  - Modal width: `100%`
  - Drawer width: `100vw`
  - Full-screen or near full-screen presentation for multi-field forms
- On desktop:
  - Keep existing business-friendly widths

4. Form and grid behavior

- Multi-column forms must collapse to single column on mobile.
- Input controls inside filter bars should become full-width on mobile.
- Dense detail sections should use stacked cards instead of fixed columns.

5. Table behavior

- Keep critical actions visible without horizontal scroll when possible.
- For unavoidable wide datasets:
  - provide card fallback or
  - define explicit mobile-visible subset with progressive reveal.

## Implemented in This Round

1. Global mobile baseline

- `apps/web-antd/src/mobile.css`
- `apps/web-antd/src/main.ts`
- `apps/web-antd/src/hooks/useMobileViewport.ts`
- `apps/web-antd/src/hooks/useAdaptivePopup.ts`
- `apps/web-antd/src/views/qms/shared/components/MobilePageShell.vue`

2. Inspection requests module

- `apps/web-antd/src/views/qms/inspection/requests/index.vue`
- `apps/web-antd/src/views/qms/inspection/requests/components/DispatchTaskModal.vue`
- `apps/web-antd/src/views/qms/inspection/requests/components/DispatchDetailDrawer.vue`
- `apps/web-antd/src/views/qms/inspection/requests/components/InspectorStatusDrawer.vue`
- `apps/web-antd/src/views/qms/inspection/requests/components/CloseQrModal.vue`
- `apps/web-antd/src/views/qms/inspection/requests/components/CloseInspectionModal.vue`

3. Inspection records module

- `apps/web-antd/src/views/qms/inspection/records/index.vue`
- `apps/web-antd/src/views/qms/inspection/records/components/InspectionGrid.vue`
- `apps/web-antd/src/views/qms/inspection/records/components/InspectionForm.vue`

4. Inspection issues module (completed)

- `apps/web-antd/src/views/qms/inspection/issues/index.vue`
- `apps/web-antd/src/views/qms/inspection/issues/components/IssueEditModal.vue`
- `apps/web-antd/src/views/qms/inspection/issues/components/IssueCustomChartBuilderModal.vue`

5. Work order module (completed)

- `apps/web-antd/src/views/qms/work-order/components/WorkOrderToolbarActions.vue`
- `apps/web-antd/src/views/qms/work-order/components/WorkOrderRequirementBoardDrawer.vue`
- `apps/web-antd/src/views/qms/work-order/components/WorkOrderEditModal.vue`
- `apps/web-antd/src/views/qms/work-order/index.vue`
- `apps/web-antd/src/views/qms/workspace/components/WorkOrderAggregateDrawer.vue`

6. Quality loss module (completed)

- `apps/web-antd/src/views/qms/quality-loss/index.vue`
- `apps/web-antd/src/views/qms/quality-loss/components/LossEditModal.vue`
- `apps/web-antd/src/views/qms/quality-loss/components/LossClaimModal.vue`
- `apps/web-antd/src/views/qms/quality-loss/components/LossKpiCards.vue`
- `apps/web-antd/src/views/qms/quality-loss/components/LossCharts.vue`

7. Reports module (completed)

- `apps/web-antd/src/views/qms/reports/index.vue`
- `apps/web-antd/src/views/qms/reports/components/ReportTable.vue`

8. Outsourcing module (completed)

- `apps/web-antd/src/views/qms/outsourcing/index.vue`
- `apps/web-antd/src/views/qms/supplier/components/SupplierDetailDrawer.vue`
- `apps/web-antd/src/views/qms/supplier/components/ScoringRulesModal.vue`

9. Metrology module (completed)

- `apps/web-antd/src/views/qms/metrology/index.vue`
- `apps/web-antd/src/views/qms/metrology/components/MetrologyEditModal.vue`

10. Reports summary module (completed)

- `apps/web-antd/src/views/qms/reports/summary/index.vue`
- `apps/web-antd/src/views/qms/reports/WeeklyReport.vue`
- `apps/web-antd/src/views/qms/reports/MonthlyReportContent.vue`

11. Vehicle commissioning module (completed)

- `apps/web-antd/src/views/qms/vehicle-commissioning/index.vue`
- `apps/web-antd/src/views/qms/vehicle-commissioning/components/VehicleCommissioningOverviewCard.vue`
- `apps/web-antd/src/views/qms/vehicle-commissioning/utils/issue-status.ts`

## Migration Backlog (System-Wide)

Apply the same baseline in the following order:

1. High-frequency operational pages

- Inspection execution pages
- `inspection/records` completed
- `inspection/issues` completed (core page + core popups)
- Production/dispatch-related pages
- `inspection/requests` completed
- `work-order` completed (page + core interactions + aggregate drawer)
- `quality-loss` completed
- `reports` completed
- `outsourcing` completed
- `metrology` completed
- `reports summary` completed
- `vehicle-commissioning` completed

2. Data-heavy list pages

- Dictionary/config management pages
- Ledger/report list pages

3. Remaining business modules

- Procurement/supplier workflows
- Project/process supporting pages

For each page/module, the definition of done is:

- Toolbar inputs usable with one-hand mobile interaction
- Primary actions visible without zoom
- Popup forms fully operable on <=390px viewport
- No clipped content at safe-area boundaries

## Guardrail for New Features

For every newly added page/component:

1. Must use shared mobile utilities when it contains popup or dense forms.
2. Must pass:

- `pnpm lint`
- `pnpm run check:type`
- `pnpm run check:qms-arch`

3. Must include a quick mobile self-check in PR description:

- viewport width `390x844`
- key flow screenshots (entry, edit modal, submit state)
