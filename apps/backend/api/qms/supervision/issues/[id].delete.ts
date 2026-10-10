import { SUPERVISION_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, getQuery } from 'h3';
import { authorizeWrite } from '~/modules/rbac';
import { buildSupervisionAccessContext } from '~/modules/supervision/supervision-access';
import { SupervisionIssueService } from '~/modules/supervision/supervision-issue.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const userinfo = await authorizeWrite(
      event,
      SUPERVISION_PERMISSION_CODES.DELETE,
    );
    const context = buildSupervisionAccessContext(userinfo);
    const query = getQuery(event);
    const id = String(query.id || '').trim();
    if (!id) return badRequestResponse(event, '问题ID不能为空');

    await SupervisionIssueService.deleteIssue(id, context);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('supervision-issue-delete', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, '删除问题失败');
  }
});
