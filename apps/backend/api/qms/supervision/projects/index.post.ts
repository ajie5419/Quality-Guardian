import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { SupervisionService } from '~/modules/supervision/supervision.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const createProjectBodySchema = z
  .object({ projectName: z.unknown().optional() })
  .passthrough();

export default defineEventHandler(async (event) => {
  try {
    const body = createProjectBodySchema.parse(await readBody(event));
    if (!String(body.projectName || '').trim()) {
      return badRequestResponse(event, '项目名称不能为空');
    }
    const data = await SupervisionService.createProject(body);
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('supervision-projects-create', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(
      event,
      'Failed to create supervision project',
    );
  }
});
