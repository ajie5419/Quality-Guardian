import { InspectionArchiveTaskService } from './inspection-archive-task.service';
import { InspectionIssueQueryService } from './inspection-issue-query.service';
import { InspectionRecordMutationService } from './inspection-record-mutation.service';
import { InspectionRecordQueryService } from './inspection-record-query.service';
import { InspectionRecordRules } from './inspection-record-types';
import { InspectionReportingService } from './inspection-reporting.service';
import { InspectionScoreDataService } from './inspection-score-data.service';

export const InspectionCoreService = {
  ...InspectionReportingService,
  ...InspectionScoreDataService,
  ...InspectionRecordQueryService,
  ...InspectionRecordRules,
  ...InspectionRecordMutationService,
  ...InspectionArchiveTaskService,
  ...InspectionIssueQueryService,
};
