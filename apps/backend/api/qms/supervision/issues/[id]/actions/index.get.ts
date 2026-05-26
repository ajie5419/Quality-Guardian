import { defineEventHandler, getRouterParam } from 'h3';
import { SupervisionService } from '~/modules/supervision/supervision.service';
import { logApiError } from '~/utils/api-logger';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) return badRequestResponse(event, '无效监造问题ID');

  try {
    const data = await SupervisionService.listIssueActions(id);
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('supervision-issue-actions-list', error, undefined, event);
    return internalServerErrorResponse(
      event,
      'Failed to fetch supervision issue actions',
    );
  }
});
