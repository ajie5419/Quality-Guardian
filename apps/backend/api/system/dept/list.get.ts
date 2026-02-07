import { defineEventHandler } from 'h3';
import { DeptService } from '~/services/dept.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const tree = await DeptService.findAll();
    return useResponseSuccess(tree);
  } catch (error) {
    logApiError('dept', error);
    return useResponseSuccess([]);
  }
});
