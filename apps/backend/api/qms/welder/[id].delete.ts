import { WELDER_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { authorizeWrite } from '~/modules/rbac';
import { WelderService } from '~/modules/welder/welder.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, WELDER_PERMISSION_CODES.DELETE);
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
