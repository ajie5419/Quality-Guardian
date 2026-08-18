import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { QualityLossService } from '~/modules/quality-loss/quality-loss.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
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
  await authorizeWrite(event, PERMISSION_CODES.QMS.LOSS_ANALYSIS.EDIT);
  const userinfo = getCurrentUser(event);
  const id = getRequiredRouterParam(event, 'id', '请求缺少 ID 参数');
  if (typeof id !== 'string') return id;

  try {
    const body = bodySchema.parse(await readBody(event));
    const result = await QualityLossService.updateByRouteId({
      body,
      dataScope: event.context.dataScope,
      id,
      userId: String(userinfo.id),
      username: userinfo.username,
    });
    if (result.ok) return useResponseSuccess({ message: '更新成功' });
    if (result.code === 'BAD_REQUEST')
      return badRequestResponse(event, result.message);
    if (result.code === 'NOT_FOUND')
      return notFoundResponse(event, result.message);
    return internalServerErrorResponse(event, result.message);
  } catch (error) {
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    logApiError('quality-loss', error, undefined, event);
    const err = error as { message?: string };
    return internalServerErrorResponse(
      event,
      `数据更新失败：${err.message || '数据库操作异常'}`,
    );
  }
});
