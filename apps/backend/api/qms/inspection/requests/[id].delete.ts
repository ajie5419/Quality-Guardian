import { defineEventHandler } from 'h3';
import { InspectionRequestDeleteService } from '~/modules/inspection/inspection-request-delete.service';
import { logApiError } from '~/utils/api-logger';
import { BusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  badRequestResponse,
  forbiddenResponse,
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
    if (error instanceof BusinessError) {
      if (error.httpStatus === 404)
        return notFoundResponse(event, error.message);
      if (error.httpStatus === 403)
        return forbiddenResponse(event, error.message);
      if (error.httpStatus === 400)
        return badRequestResponse(event, error.message);
    }
    return internalServerErrorResponse(event, '删除报检任务失败');
  }
});
