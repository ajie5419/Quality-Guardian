import { INSPECTION_RECORD_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import inspectionRecordImportHandler from '~/modules/inspection/inspection-record-import.post.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { internalServerErrorResponse } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    await authorizeWrite(event, INSPECTION_RECORD_PERMISSION_CODES.IMPORT);
    return await inspectionRecordImportHandler(event);
  } catch (error) {
    logApiError('inspection-record-import-auth', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, '导入检验记录失败');
  }
});
