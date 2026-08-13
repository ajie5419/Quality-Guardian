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
  findIdBySerialNumber: (
    ...args: Parameters<
      typeof AfterSalesIntegrationService.findIdBySerialNumber
    >
  ) => AfterSalesIntegrationService.findIdBySerialNumber(...args),
  findEarliestVehicleFailureDate: (
    ...args: Parameters<
      typeof AfterSalesIntegrationService.findEarliestVehicleFailureDate
    >
  ) => AfterSalesIntegrationService.findEarliestVehicleFailureDate(...args),

  // Bulk read for aggregations and trend
  getLossRecordsForAggregation: (
    ...args: Parameters<
      typeof AfterSalesIntegrationService.getLossRecordsForAggregation
    >
  ) => AfterSalesIntegrationService.getLossRecordsForAggregation(...args),
  countLossRecordsForAggregation: (
    ...args: Parameters<
      typeof AfterSalesIntegrationService.countLossRecordsForAggregation
    >
  ) => AfterSalesIntegrationService.countLossRecordsForAggregation(...args),
  getQualityLossDrillDownRecords: (
    ...args: Parameters<
      typeof AfterSalesIntegrationService.getQualityLossDrillDownRecords
    >
  ) => AfterSalesIntegrationService.getQualityLossDrillDownRecords(...args),
  getQualityLossTrendRows: (
    ...args: Parameters<
      typeof AfterSalesIntegrationService.getQualityLossTrendRows
    >
  ) => AfterSalesIntegrationService.getQualityLossTrendRows(...args),
  getSupplierScoringData: (
    ...args: Parameters<
      typeof AfterSalesIntegrationService.getSupplierScoringData
    >
  ) => AfterSalesIntegrationService.getSupplierScoringData(...args),
  getWeeklyReportIssues: (
    ...args: Parameters<
      typeof AfterSalesIntegrationService.getWeeklyReportIssues
    >
  ) => AfterSalesIntegrationService.getWeeklyReportIssues(...args),
  getVehicleFailureRecords: (
    ...args: Parameters<
      typeof AfterSalesIntegrationService.getVehicleFailureRecords
    >
  ) => AfterSalesIntegrationService.getVehicleFailureRecords(...args),

  // Period metrics for KPI assembly
  getReportPeriodMetrics: (
    ...args: Parameters<
      typeof AfterSalesIntegrationService.getReportPeriodMetrics
    >
  ) => AfterSalesIntegrationService.getReportPeriodMetrics(...args),
  getStatsForDashboard: (
    ...args: Parameters<
      typeof AfterSalesIntegrationService.getStatsForDashboard
    >
  ) => AfterSalesIntegrationService.getStatsForDashboard(...args),

  // Update path that quality-loss PUT route reaches into
  updateQualityLossFields: (
    ...args: Parameters<
      typeof AfterSalesIntegrationService.updateQualityLossFields
    >
  ) => AfterSalesIntegrationService.updateQualityLossFields(...args),
};
