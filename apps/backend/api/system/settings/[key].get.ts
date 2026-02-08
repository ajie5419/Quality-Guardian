import { eventHandler, getRouterParam } from 'h3';
import { PreferenceService } from '~/services/preference.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const key = getRouterParam(event, 'key');
  if (!key) {
    return useResponseError('Missing key parameter');
  }

  try {
    const setting = await PreferenceService.getSystemSetting(key);

    let value = setting?.value;
    if (value) {
      try {
        value = JSON.parse(value);
      } catch {
        // stay as string
      }
    }

    return useResponseSuccess(value);
  } catch (error) {
    logApiError(`get_system_setting_${key}`, error);
    return useResponseError('Failed to fetch system setting');
  }
});
