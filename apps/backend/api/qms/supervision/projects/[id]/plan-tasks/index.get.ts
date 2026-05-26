import { defineEventHandler, getRouterParam } from 'h3';
import { SupervisionService } from '~/modules/supervision/supervision.service';
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
    const data = await SupervisionService.listPlanTasks(projectId);
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('supervision-plan-tasks-list', error, undefined, event);
    return internalServerErrorResponse(
      event,
      'Failed to fetch supervision plan tasks',
    );
  }
});
