import { SUPERVISION_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { authorizeWrite } from '~/modules/rbac';
import { SupervisionPlanTaskService } from '~/modules/supervision/supervision-plan-task.service';
import { updatePlanTaskSchema } from '~/modules/supervision/supervision.schema';
import { logApiError } from '~/utils/api-logger';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, SUPERVISION_PERMISSION_CODES.EDIT);
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
    logApiError('supervision-plan-task-update', error, undefined, event);
    return internalServerErrorResponse(event, '更新甘特任务失败');
  }
});
