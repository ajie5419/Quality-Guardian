import { InspectionArchiveTaskService } from './inspection-archive-task.service';
import { InspectionIssueQueryService } from './inspection-issue-query.service';
import { InspectionRecordMutationService } from './inspection-record-mutation.service';
import { InspectionRecordQueryService } from './inspection-record-query.service';
import { InspectionRecordRules } from './inspection-record-types';
import { InspectionReportingService } from './inspection-reporting.service';

export const InspectionCoreService = {
  ...InspectionReportingService,
  ...InspectionRecordQueryService,
  ...InspectionRecordRules,
  ...InspectionRecordMutationService,
  ...InspectionArchiveTaskService,
  ...InspectionIssueQueryService,
};
