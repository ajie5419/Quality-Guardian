import { INSPECTION_RECORD_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import inspectionRecordCreateHandler from '~/modules/inspection/inspection-record-create.post.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, INSPECTION_RECORD_PERMISSION_CODES.CREATE);
  return inspectionRecordCreateHandler(event);
});
