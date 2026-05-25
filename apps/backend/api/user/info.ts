import { eventHandler } from 'h3';
import { UserService } from '~/modules/user/user.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default eventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const freshUserInfo = await UserService.getInfoByTokenPayload(userinfo);
    if (freshUserInfo) return useResponseSuccess(freshUserInfo);
  } catch (error) {
    logApiError('info', error, undefined, event);
  }

  return useResponseSuccess(userinfo);
});
