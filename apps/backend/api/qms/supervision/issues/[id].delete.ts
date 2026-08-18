import { SUPERVISION_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, getQuery } from 'h3';
import { authorizeWrite } from '~/modules/rbac';
import { SupervisionIssueService } from '~/modules/supervision/supervision-issue.service';
import { logApiError } from '~/utils/api-logger';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, SUPERVISION_PERMISSION_CODES.DELETE);
  const query = getQuery(event);
  const id = String(query.id || '').trim();
  if (!id) return badRequestResponse(event, '问题ID不能为空');

  try {
    await SupervisionIssueService.deleteIssue(id);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('supervision-issue-delete', error, undefined, event);
    return internalServerErrorResponse(event, '删除问题失败');
  }
});
