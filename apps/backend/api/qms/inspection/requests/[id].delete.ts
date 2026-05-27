import { defineEventHandler } from 'h3';
import { InspectionRequestDeleteService } from '~/modules/inspection/inspection-request-delete.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') return id;

  try {
    await InspectionRequestDeleteService.deleteRequest(event, id, userinfo);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('inspection-request-delete', error, { id }, event);
    if (error instanceof Error && error.message.startsWith('NOT_FOUND:'))
      return notFoundResponse(event, error.message.replace('NOT_FOUND:', ''));
    return internalServerErrorResponse(event, '删除报检任务失败');
  }
});
