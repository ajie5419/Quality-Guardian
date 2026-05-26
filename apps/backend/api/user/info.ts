import { eventHandler } from 'h3';
import { UserService } from '~/modules/user/user.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { useResponseSuccess } from '~/utils/response';

export default eventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  try {
    const freshUserInfo = await UserService.getInfoByTokenPayload(userinfo);
    if (freshUserInfo) return useResponseSuccess(freshUserInfo);
  } catch (error) {
    logApiError('info', error, undefined, event);
  }

  return useResponseSuccess(userinfo);
});
