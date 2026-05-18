import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { reorderPlanTasksSchema } from '~/schemas/supervision';
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
    const { items } = reorderPlanTasksSchema.parse(body) as {
      items: Array<{
        id: string;
        outlineLevel?: number;
        parentId?: null | string;
        sortOrder: number;
      }>;
    };
    const data = await SupervisionPlanTaskService.reorderTasks(
      projectId,
      items,
    );
    return useResponseSuccess(data);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return badRequestResponse(
        event,
        error.issues[0]?.message || '参数校验失败',
      );
    }
    logApiError('supervision-plan-task-reorder', error);
    return internalServerErrorResponse(event, '排序甘特任务失败');
  }
});
