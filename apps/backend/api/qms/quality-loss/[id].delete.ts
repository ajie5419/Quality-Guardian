import { defineEventHandler, setResponseStatus } from 'h3';
import { QualityLossService } from '~/services/quality-loss.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredRouterParam(event, 'id', 'Missing ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await QualityLossService.deleteRecord(id, String(userinfo.id));
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('quality-loss', error);
    const errorCode = (error as { code?: string }).code;
    setResponseStatus(event, errorCode === 'NOT_FOUND' ? 404 : 500);
    return useResponseError(
      errorCode === 'NOT_FOUND' ? '记录不存在' : '删除质量损失记录失败',
    );
  }
});
