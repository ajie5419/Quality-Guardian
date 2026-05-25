import { defineEventHandler } from 'h3';
import { TaskDispatchService } from '~/modules/task-dispatch/task-dispatch.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    return useResponseSuccess(await TaskDispatchService.stats(userinfo));
  } catch (error) {
    logApiError('task-dispatch-stats', error, undefined, event);
    if (error instanceof Error && error.message === 'CURRENT_USER_NOT_FOUND')
      return badRequestResponse(event, '无法识别当前用户');
    return internalServerErrorResponse(
      event,
      'Failed to fetch task dispatch stats',
    );
  }
});
