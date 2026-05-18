import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { SupervisionService } from '~/services/supervision.service';
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

  const id = getRouterParam(event, 'id');
  if (!id) return badRequestResponse(event, '无效监造项目ID');

  try {
    const body = (await readBody(event)) as Record<string, unknown>;
    const data = await SupervisionService.updateProject(id, body);
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('supervision-projects-update', error);
    return internalServerErrorResponse(
      event,
      'Failed to update supervision project',
    );
  }
});
