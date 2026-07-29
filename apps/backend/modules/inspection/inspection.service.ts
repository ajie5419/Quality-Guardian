import { InspectionCoreService } from './inspection-core.service';
import { InspectionRequestHistoryService } from './inspection-request-history.service';

export const InspectionService = {
  batchDelete: InspectionCoreService.batchDelete,
  calculateOverallResult: InspectionCoreService.calculateOverallResult,
  create: InspectionCoreService.create,
  delete: InspectionCoreService.delete,
  deleteRecord: InspectionCoreService.deleteRecord,
  determineItemResult: InspectionCoreService.determineItemResult,
  findAll: InspectionCoreService.findAll,
  findSupplierIssues: InspectionCoreService.findSupplierIssues,
  findSupplierHistory: InspectionCoreService.findSupplierHistory,
  findById: InspectionCoreService.findById,
  findIssueIdBySerialNumber: InspectionCoreService.findIssueIdBySerialNumber,
  generateNextNcNumber: InspectionCoreService.generateNextNcNumber,
  getStatsForDashboard: InspectionCoreService.getStatsForDashboard,
  generateSerialNumber: InspectionCoreService.generateSerialNumber,
  getArchiveTasks: InspectionCoreService.getArchiveTasks,
  getDailyArchiveReportData: InspectionCoreService.getDailyArchiveReportData,
  getDailyReportInspections: InspectionCoreService.getDailyReportInspections,
  getDailyReportIssues: InspectionCoreService.getDailyReportIssues,
  getIssueChartAggregation: InspectionCoreService.getIssueChartAggregation,
  getIssues: InspectionCoreService.getIssues,
  getIssueStats: InspectionCoreService.getIssueStats,
  getQualityLossTrendRows: InspectionCoreService.getQualityLossTrendRows,
  getQualityLossDrillDownRecords:
    InspectionCoreService.getQualityLossDrillDownRecords,
  getReportDefectRows: InspectionCoreService.getReportDefectRows,
  getReportMajorEvents: InspectionCoreService.getReportMajorEvents,
  getReportPeriodMetrics: InspectionCoreService.getReportPeriodMetrics,
  getReportSupplierPerformance:
    InspectionCoreService.getReportSupplierPerformance,
  getReportTopRiskProjects: InspectionCoreService.getReportTopRiskProjects,
  getSupplierHistoryProjects:
    InspectionRequestHistoryService.getSupplierHistoryProjects,
  getSupplierScoringData: InspectionCoreService.getSupplierScoringData,
  getWelderScoreStats: InspectionCoreService.getWelderScoreStats,
  getWeeklyReportIssues: InspectionCoreService.getWeeklyReportIssues,
  getWorkOrderAggregateInspections:
    InspectionCoreService.getWorkOrderAggregateInspections,
  getLossRecordsForAggregation:
    InspectionCoreService.getLossRecordsForAggregation,
  countLossRecordsForAggregation:
    InspectionCoreService.countLossRecordsForAggregation,
  getWorkspaceIssueSummary: InspectionCoreService.getWorkspaceIssueSummary,
  normalizeQuantitySummary: InspectionCoreService.normalizeQuantitySummary,
  resolveOverallResult: InspectionCoreService.resolveOverallResult,
  update: InspectionCoreService.update,
  updateArchiveTaskStatus: InspectionCoreService.updateArchiveTaskStatus,
  updateQualityLossFields: InspectionCoreService.updateQualityLossFields,
};
