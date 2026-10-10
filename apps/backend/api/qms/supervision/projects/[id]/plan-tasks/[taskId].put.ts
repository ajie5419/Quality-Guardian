import { SUPERVISION_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { authorizeWrite } from '~/modules/rbac';
import { buildSupervisionAccessContext } from '~/modules/supervision/supervision-access';
import { SupervisionPlanTaskService } from '~/modules/supervision/supervision-plan-task.service';
import { updatePlanTaskSchema } from '~/modules/supervision/supervision.schema';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const userinfo = await authorizeWrite(
      event,
      SUPERVISION_PERMISSION_CODES.EDIT,
    );
    const context = buildSupervisionAccessContext(userinfo);
    const projectId = getRouterParam(event, 'id');
    const taskId = getRouterParam(event, 'taskId');
    if (!projectId || !taskId) return badRequestResponse(event, '参数不完整');

    const body = await readBody(event);
    const payload = updatePlanTaskSchema.parse(body);
    const data = await SupervisionPlanTaskService.updateTask(
      projectId,
      taskId,
      payload,
      context,
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
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, '更新甘特任务失败');
  }
});
