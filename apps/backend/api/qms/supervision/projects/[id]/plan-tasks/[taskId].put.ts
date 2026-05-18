import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { updatePlanTaskSchema } from '~/schemas/supervision';
import { SupervisionPlanTaskService } from '~/services/supervision-plan-task.service';
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
  if (!userinfo) return unAuthorizedResponse(event);

  const projectId = getRouterParam(event, 'id');
  const taskId = getRouterParam(event, 'taskId');
  if (!projectId || !taskId) return badRequestResponse(event, '参数不完整');

  try {
    const body = await readBody(event);
    const payload = updatePlanTaskSchema.parse(body);
    const data = await SupervisionPlanTaskService.updateTask(
      projectId,
      taskId,
      payload,
    );
    return useResponseSuccess(data);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return badRequestResponse(
        event,
        error.issues[0]?.message || '参数校验失败',
      );
    }
    logApiError('supervision-plan-task-update', error);
    return internalServerErrorResponse(event, '更新甘特任务失败');
  }
});
