import { defineEventHandler, getQuery } from 'h3';
import { SupervisionPlanTaskService } from '~/services/supervision-plan-task.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const query = getQuery(event);
    const data = await SupervisionPlanTaskService.deadlineBoard({
      dueSoonDays: query.dueSoonDays ? Number(query.dueSoonDays) : undefined,
      projectId: query.projectId ? String(query.projectId) : undefined,
    });
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('supervision-deadline-board', error);
    return internalServerErrorResponse(event, '获取纳期看板数据失败');
  }
});
