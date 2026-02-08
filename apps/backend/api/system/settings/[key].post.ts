import { eventHandler, getRouterParam, readBody } from 'h3';
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

  // TODO: Add admin role check here if needed
  // For now, we trust the user if they can call this,
  // but in production, we should check userinfo.roles.includes('Admin')

  const key = getRouterParam(event, 'key');
  if (!key) {
    return useResponseError('Missing key parameter');
  }

  try {
    const body = await readBody(event);
    const { value, description } = body;

    const valStr = typeof value === 'string' ? value : JSON.stringify(value);
    await PreferenceService.setSystemSetting(key, valStr, description);

    return useResponseSuccess({ message: 'System setting saved' });
  } catch (error) {
    logApiError(`save_system_setting_${key}`, error);
    return useResponseError('Failed to save system setting');
  }
});
