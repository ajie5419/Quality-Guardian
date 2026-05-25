import { InspectionArchiveService } from './inspection-archive.service';
import { InspectionCoreService } from './inspection-core.service';
import { InspectionIssueService } from './inspection-issue.service';
import { InspectionTemplateService } from './inspection-template.service';

export const InspectionService = {
  batchDelete: InspectionCoreService.batchDelete,
  calculateOverallResult: InspectionCoreService.calculateOverallResult,
  create: InspectionCoreService.create,
  delete: InspectionCoreService.delete,
  deleteRecord: InspectionIssueService.deleteRecord,
  determineItemResult: InspectionCoreService.determineItemResult,
  findAll: InspectionCoreService.findAll,
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
  getSupplierScoringData: InspectionCoreService.getSupplierScoringData,
  getWeeklyReportIssues: InspectionCoreService.getWeeklyReportIssues,
  getLossRecordsForAggregation:
    InspectionCoreService.getLossRecordsForAggregation,
  getWorkspaceIssueSummary: InspectionCoreService.getWorkspaceIssueSummary,
  normalizeQuantitySummary: InspectionCoreService.normalizeQuantitySummary,
  resolveOverallResult: InspectionCoreService.resolveOverallResult,
  update: InspectionCoreService.update,
  updateArchiveTaskStatus: InspectionArchiveService.updateArchiveTaskStatus,
  updateQualityLossFields: InspectionCoreService.updateQualityLossFields,
};
