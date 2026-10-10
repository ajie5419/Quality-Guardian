import type { PlanTaskCreatePayload } from '~/modules/supervision/supervision.schema';

import { SUPERVISION_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { authorizeWrite } from '~/modules/rbac';
import { buildSupervisionAccessContext } from '~/modules/supervision/supervision-access';
import { SupervisionPlanTaskService } from '~/modules/supervision/supervision-plan-task.service';
import { createPlanTaskSchema } from '~/modules/supervision/supervision.schema';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const context = buildSupervisionAccessContext(
      await authorizeWrite(event, SUPERVISION_PERMISSION_CODES.CREATE),
    );
    const projectId = getRouterParam(event, 'id');
    if (!projectId) return badRequestResponse(event, '监造项目不能为空');

    const body = await readBody(event);
    const payload = createPlanTaskSchema.parse(body) as PlanTaskCreatePayload;
    const data = await SupervisionPlanTaskService.createTask(
      projectId,
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
    logApiError('supervision-plan-task-create', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, '创建甘特任务失败');
  }
});
