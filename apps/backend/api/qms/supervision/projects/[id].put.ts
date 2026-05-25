import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { SupervisionService } from '~/modules/supervision/supervision.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const updateProjectBodySchema = z.object({}).passthrough();

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const id = getRouterParam(event, 'id');
  if (!id) return badRequestResponse(event, '无效监造项目ID');

  try {
    const body = updateProjectBodySchema.parse(await readBody(event));
    const data = await SupervisionService.updateProject(id, body);
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('supervision-projects-update', error, undefined, event);
    return internalServerErrorResponse(
      event,
      'Failed to update supervision project',
    );
  }
});
