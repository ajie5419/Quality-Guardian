import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { createPlanTaskSchema } from '~/schemas/supervision';
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
  if (!projectId) return badRequestResponse(event, '监造项目不能为空');

  try {
    const body = await readBody(event);
    const payload = createPlanTaskSchema.parse(body) as {
      durationDays?: number;
      parentId?: string;
      plannedEndAt?: string;
      plannedQuantity: number;
      plannedStartAt?: string;
      predecessorText?: string;
      quantityUnit: string;
      resourceName?: string;
      taskName: string;
      taskNo: string;
      weight: number;
    };
    const data = await SupervisionPlanTaskService.createTask(
      projectId,
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
    logApiError('supervision-plan-task-create', error);
    return internalServerErrorResponse(event, '创建甘特任务失败');
  }
});
