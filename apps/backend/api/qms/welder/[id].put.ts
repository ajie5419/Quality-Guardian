import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { WelderService } from '~/modules/welder/welder.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

const bodySchema = z.record(z.string(), z.unknown());

export default defineEventHandler(async (event) => {
  const id = getRequiredRouterParam(event, 'id', '缺少焊工ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await WelderService.update(id, bodySchema.parse(await readBody(event)));
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('welder', error, undefined, event);
    return internalServerErrorResponse(event, '更新焊工失败');
  }
});
