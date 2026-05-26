import { defineEventHandler, getQuery } from 'h3';
import { SupervisionPlanTaskService } from '~/modules/supervision/supervision-plan-task.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const data = await SupervisionPlanTaskService.deadlineBoard({
      dueSoonDays: query.dueSoonDays ? Number(query.dueSoonDays) : undefined,
      projectId: query.projectId ? String(query.projectId) : undefined,
    });
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('supervision-deadline-board', error, undefined, event);
    return internalServerErrorResponse(event, '获取纳期看板数据失败');
  }
});
