import { InspectionCoreService } from './inspection-core.service';

export const InspectionIssueService = {
  buildIssueTrendData: InspectionCoreService.buildIssueTrendData,
  deleteRecord: InspectionCoreService.deleteRecord,
  generateNextNcNumber: InspectionCoreService.generateNextNcNumber,
  getIssueChartAggregation: InspectionCoreService.getIssueChartAggregation,
  getIssues: InspectionCoreService.getIssues,
  getIssueStats: InspectionCoreService.getIssueStats,
};
