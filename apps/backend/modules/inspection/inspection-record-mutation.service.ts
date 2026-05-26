import { InspectionRecordCreateService } from './inspection-record-create.service';
import { InspectionRecordDeleteService } from './inspection-record-delete.service';
import { InspectionRecordUpdateService } from './inspection-record-update.service';

export const InspectionRecordMutationService = {
  ...InspectionRecordCreateService,
  ...InspectionRecordUpdateService,
  ...InspectionRecordDeleteService,
};
