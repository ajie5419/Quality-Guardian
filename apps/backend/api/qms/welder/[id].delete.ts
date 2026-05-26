import { defineEventHandler } from 'h3';
import { WelderService } from '~/modules/welder/welder.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const id = getRequiredRouterParam(event, 'id', '缺少焊工ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await WelderService.softDelete(id);
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('welder', error, undefined, event);
    return internalServerErrorResponse(event, '删除焊工失败');
  }
});
