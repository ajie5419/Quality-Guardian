import { InspectionIssueListService } from './inspection-issue-list.service';
import { InspectionIssueNumberingService } from './inspection-issue-numbering.service';
import { InspectionIssueStatsService } from './inspection-issue-stats.service';

export const InspectionIssueQueryService = {
  ...InspectionIssueListService,
  ...InspectionIssueStatsService,
  ...InspectionIssueNumberingService,
};
