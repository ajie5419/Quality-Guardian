import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { InspectionApiService } from '~/modules/inspection/inspection-api.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';
import {
  badRequestResponse,
  conflictResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const schema = z.object({}).passthrough();

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const body = schema.parse(await readBody(event));
    const sourceType = String(body.sourceType || '')
      .trim()
      .toUpperCase();
    if (
      (sourceType === 'INSPECTION' || sourceType === 'INSPECTION_RECORD') &&
      !String(body.inspectionId || '').trim()
    ) {
      return badRequestResponse(
        event,
        '检验记录来源创建不合格项时必须携带 inspectionId',
      );
    }
    return useResponseSuccess(
      await InspectionApiService.createIssue(userinfo, body),
    );
  } catch (error) {
    logApiError('issues', error, undefined, event);
    if (error instanceof Error && error.message.startsWith('BAD_REQUEST:'))
      return badRequestResponse(
        event,
        error.message.replace('BAD_REQUEST:', ''),
      );
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, 'NC number already exists');
    }
    return internalServerErrorResponse(event, 'Failed to create issue');
  }
});
