# Task Plan: Configurable Pass Rate Indicators

## Goal

Migrate hardcoded process defect targets to the database and provide a UI in the Dashboard for manual testing and target adjustment.

## Context & Constraints

- **Context**: Quality managers need to "test" how different target values affect the dashboard's pass rate status indicators without redeploying code.
- **Constraints**:
  - Use `system_settings` table.
  - Maintain backward compatibility with hardcoded defaults.
  - Integration with existing `v-html` based dashboard cards.

## Technical Approach

1. **Backend Development**:
   - Create `GET/POST` endpoints for `QMS_PASS_RATE_TARGETS`.
   - Update calculated trend logic to pull from DB.
2. **Frontend Development**:
   - Build `PassRateTargetModal` for bulk editing process targets.
   - Add trigger icon to `qms/dashboard/index.vue`.
3. **Verification**:
   - Toggle values and confirm UI updates.

# Task Plan: System Monitoring (Stage 10)

## Goal

Implement a monitoring dashboard showing Application Server (Node.js) and Remote Database Server (MySQL) health/metrics.

## Technical Approach

1. **Backend**:
   - `system.service.ts`: Use `node:os` for local server, `prisma.$queryRaw` for remote DB info.
   - `API`: New `GET /api/system/monitor`.
2. **Frontend**:
   - `monitor/index.vue`: Dashboard cards with progress bars for resources.
   - Network Latency tracking via SQL ping.

## Risk Assessment

- **DB Caching**: Prisma client might need refresh if settings are updated frequently? -> Handled by standard query lifecycle.
- **Frontend Sync**: Ensure that after saving, the charts properly re-fetch. -> Use `refetch` or manual load calls.

## Success Criteria

- [ ] Database stores process targets as JSON.
- [ ] Dashboard Settings modal functional.
- [ ] Chart status (color codes) responds to target changes.
