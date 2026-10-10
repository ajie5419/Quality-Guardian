import { SUPERVISION_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, getRouterParam } from 'h3';
import { authorizeWrite } from '~/modules/rbac';
import { buildSupervisionAccessContext } from '~/modules/supervision/supervision-access';
import { SupervisionPlanTaskService } from '~/modules/supervision/supervision-plan-task.service';
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
      SUPERVISION_PERMISSION_CODES.DELETE,
    );
    const context = buildSupervisionAccessContext(userinfo);
    const projectId = getRouterParam(event, 'id');
    const taskId = getRouterParam(event, 'taskId');
    if (!projectId || !taskId) return badRequestResponse(event, '参数不完整');

    const data = await SupervisionPlanTaskService.deleteTask(
      projectId,
      taskId,
      context,
    );
    return useResponseSuccess(data);
  } catch (error: any) {
    logApiError('supervision-plan-task-delete', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, '删除甘特任务失败');
  }
});
