import { SUPERVISION_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { authorizeWrite } from '~/modules/rbac';
import upstreamHandler from '~/modules/supervision/supervision-issue-create.post.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { internalServerErrorResponse } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    await authorizeWrite(event, SUPERVISION_PERMISSION_CODES.CREATE);
    return await upstreamHandler(event);
  } catch (error) {
    logApiError('supervision-write', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(
      event,
      'Failed to write supervision resource',
    );
  }
});
