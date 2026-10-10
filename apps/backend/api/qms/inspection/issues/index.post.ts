import { INSPECTION_ISSUE_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import inspectionIssueCreateHandler from '~/modules/inspection/inspection-issue-create.post.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { internalServerErrorResponse } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    await authorizeWrite(event, INSPECTION_ISSUE_PERMISSION_CODES.CREATE);
    return await inspectionIssueCreateHandler(event);
  } catch (error) {
    logApiError('inspection-issue-create-auth', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, '新增不合格品项失败');
  }
});
