import { INSPECTION_ISSUE_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import inspectionIssueDeleteHandler from '~/modules/inspection/inspection-issue-id.delete.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { internalServerErrorResponse } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    await authorizeWrite(event, INSPECTION_ISSUE_PERMISSION_CODES.DELETE);
    return await inspectionIssueDeleteHandler(event);
  } catch (error) {
    logApiError('inspection-issue-delete-auth', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, '删除不合格品项失败');
  }
});
