import { defineEventHandler, readBody } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);
    const status = String(body?.status || '')
      .trim()
      .toUpperCase();
    const workContent = body?.workContent;
    if (!status) {
      return badRequestResponse(event, '缺少归档状态');
    }

    const updated = await InspectionService.updateArchiveTaskStatus({
      id,
      status: status as any,
      workContent:
        workContent === undefined ? undefined : String(workContent || ''),
    });
    return useResponseSuccess(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '更新归档状态失败';
    logApiError('inspection-archive-task-status', error);
    return internalServerErrorResponse(event, message);
  }
});
