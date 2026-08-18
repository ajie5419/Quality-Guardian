import { SUPERVISION_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { authorizeWrite } from '~/modules/rbac';
import { SupervisionService } from '~/modules/supervision/supervision.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const updateProjectBodySchema = z.object({}).passthrough();

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, SUPERVISION_PERMISSION_CODES.EDIT);
  const id = getRouterParam(event, 'id');
  if (!id) return badRequestResponse(event, '无效监造项目ID');

  try {
    const body = updateProjectBodySchema.parse(await readBody(event));
    const data = await SupervisionService.updateProject(id, body);
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('supervision-projects-update', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(
      event,
      'Failed to update supervision project',
    );
  }
});
