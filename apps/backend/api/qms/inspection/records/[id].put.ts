import { INSPECTION_RECORD_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import inspectionRecordUpdateHandler from '~/modules/inspection/inspection-record-id.put.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, INSPECTION_RECORD_PERMISSION_CODES.EDIT);
  return inspectionRecordUpdateHandler(event);
});
