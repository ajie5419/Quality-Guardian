import { AfterSalesIntegrationService } from './after-sales-integration.service';

/**
 * Read-only facade for after-sales data consumed by other modules
 * (quality-loss, supplier-scoring, dashboard, report). The internal
 * CRUD methods (create / updateByRoute / deleteRecord / batchDelete /
 * importItems) intentionally are NOT exposed here — they belong to
 * after-sales own write path.
 *
 * Adding a new method to AfterSalesAPI is a deliberate signal that it
 * becomes part of the after-sales module's external contract. Keep
 * this surface intentionally small.
 */
export const AfterSalesAPI = {
  // Identity lookups
  findIdBySerialNumber: AfterSalesIntegrationService.findIdBySerialNumber,
  findEarliestVehicleFailureDate:
    AfterSalesIntegrationService.findEarliestVehicleFailureDate,

  // Bulk read for aggregations and trend
  getLossRecordsForAggregation:
    AfterSalesIntegrationService.getLossRecordsForAggregation,
  countLossRecordsForAggregation:
    AfterSalesIntegrationService.countLossRecordsForAggregation,
  getQualityLossDrillDownRecords:
    AfterSalesIntegrationService.getQualityLossDrillDownRecords,
  getQualityLossTrendRows: AfterSalesIntegrationService.getQualityLossTrendRows,
  getSupplierScoringData: AfterSalesIntegrationService.getSupplierScoringData,
  getWeeklyReportIssues: AfterSalesIntegrationService.getWeeklyReportIssues,
  getVehicleFailureRecords:
    AfterSalesIntegrationService.getVehicleFailureRecords,

  // Period metrics for KPI assembly
  getReportPeriodMetrics: AfterSalesIntegrationService.getReportPeriodMetrics,
  getStatsForDashboard: AfterSalesIntegrationService.getStatsForDashboard,

  // Update path that quality-loss PUT route reaches into
  updateQualityLossFields: AfterSalesIntegrationService.updateQualityLossFields,
};
