import { defineEventHandler, readBody } from 'h3';
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

  try {
    const body = (await readBody(event)) as Record<string, unknown>;
    if (!String(body.projectName || '').trim()) {
      return badRequestResponse(event, '项目名称不能为空');
    }
    const data = await SupervisionService.createProject(body);
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('supervision-projects-create', error);
    return internalServerErrorResponse(
      event,
      'Failed to create supervision project',
    );
  }
});
