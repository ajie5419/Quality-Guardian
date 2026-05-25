import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { WelderService } from '~/modules/welder/welder.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const bodySchema = z.record(z.string(), z.unknown());

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    return useResponseSuccess(
      await WelderService.create(bodySchema.parse(await readBody(event))),
    );
  } catch (error: unknown) {
    logApiError('welder', error, undefined, event);
    if (error instanceof Error && error.message === 'MISSING_REQUIRED')
      return badRequestResponse(event, '缺少必填字段: name/team');
    return internalServerErrorResponse(event, '创建焊工失败');
  }
});
