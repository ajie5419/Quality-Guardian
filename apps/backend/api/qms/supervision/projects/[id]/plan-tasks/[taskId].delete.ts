import { defineEventHandler, getRouterParam } from 'h3';
import { SupervisionPlanTaskService } from '~/modules/supervision/supervision-plan-task.service';
import { logApiError } from '~/utils/api-logger';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id');
  const taskId = getRouterParam(event, 'taskId');
  if (!projectId || !taskId) return badRequestResponse(event, '参数不完整');

  try {
    const data = await SupervisionPlanTaskService.deleteTask(projectId, taskId);
    return useResponseSuccess(data);
  } catch (error: any) {
    logApiError('supervision-plan-task-delete', error, undefined, event);
    return internalServerErrorResponse(event, '删除甘特任务失败');
  }
});
