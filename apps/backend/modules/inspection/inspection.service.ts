import { InspectionArchiveService } from './inspection-archive.service';
import { InspectionCoreService } from './inspection-core.service';
import { InspectionIssueService } from './inspection-issue.service';
import { InspectionRequestHistoryService } from './inspection-request-history.service';
import { InspectionTemplateService } from './inspection-template.service';

export const InspectionService = {
  batchDelete: InspectionCoreService.batchDelete,
  calculateOverallResult: InspectionCoreService.calculateOverallResult,
  create: InspectionCoreService.create,
  delete: InspectionCoreService.delete,
  deleteRecord: InspectionIssueService.deleteRecord,
  determineItemResult: InspectionCoreService.determineItemResult,
  findAll: InspectionCoreService.findAll,
  findSupplierHistory: InspectionCoreService.findSupplierHistory,
  findById: InspectionTemplateService.findById,
  findIssueIdBySerialNumber: InspectionCoreService.findIssueIdBySerialNumber,
  generateNextNcNumber: InspectionIssueService.generateNextNcNumber,
  getStatsForDashboard: InspectionCoreService.getStatsForDashboard,
  generateSerialNumber: InspectionCoreService.generateSerialNumber,
  getArchiveTasks: InspectionArchiveService.getArchiveTasks,
  getDailyArchiveReportData: InspectionCoreService.getDailyArchiveReportData,
  getDailyReportInspections: InspectionCoreService.getDailyReportInspections,
  getDailyReportIssues: InspectionCoreService.getDailyReportIssues,
  getIssueChartAggregation: InspectionIssueService.getIssueChartAggregation,
  getIssues: InspectionIssueService.getIssues,
  getIssueStats: InspectionIssueService.getIssueStats,
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
  updateArchiveTaskStatus: InspectionArchiveService.updateArchiveTaskStatus,
  updateQualityLossFields: InspectionCoreService.updateQualityLossFields,
};
