import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { SupervisionPlanTaskService } from '~/modules/supervision/supervision-plan-task.service';
import { reorderPlanTasksSchema } from '~/modules/supervision/supervision.schema';
import { logApiError } from '~/utils/api-logger';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
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
    logApiError('supervision-plan-task-reorder', error, undefined, event);
    return internalServerErrorResponse(event, '排序甘特任务失败');
  }
});
