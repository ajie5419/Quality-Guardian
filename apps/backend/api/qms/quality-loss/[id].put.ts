import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { QualityLossService } from '~/modules/quality-loss/quality-loss.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  badRequestResponse,
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

const bodySchema = z.object({}).passthrough();

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  const id = getRequiredRouterParam(event, 'id', '请求缺少 ID 参数');
  if (typeof id !== 'string') return id;

  try {
    const body = bodySchema.parse(await readBody(event));
    const result = await QualityLossService.updateByRouteId({
      body,
      id,
      userId: String(userinfo.id),
    });
    if (!result.ok) {
      if (result.code === 'BAD_REQUEST')
        return badRequestResponse(event, result.message);
      if (result.code === 'NOT_FOUND')
        return notFoundResponse(event, result.message);
      return internalServerErrorResponse(event, result.message);
    }
    return useResponseSuccess({ message: '更新成功' });
  } catch (error) {
    logApiError('quality-loss', error, undefined, event);
    const err = error as { message?: string };
    return internalServerErrorResponse(
      event,
      `数据更新失败：${err.message || '数据库操作异常'}`,
    );
  }
});
