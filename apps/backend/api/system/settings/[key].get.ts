import { eventHandler, getRouterParam, setResponseStatus } from 'h3';
import { PreferenceService } from '~/modules/user/preference.service';
import { logApiError } from '~/utils/api-logger';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default eventHandler(async (event) => {
  const key = getRouterParam(event, 'key');
  if (!key) {
    setResponseStatus(event, 400);
    return useResponseError('Missing key parameter');
  }

  try {
    const setting = await PreferenceService.getSystemSetting(key);

    let value = setting?.value;
    if (value) {
      try {
        value = JSON.parse(value);
      } catch (error) {
        logApiError(
          `parse_system_setting_${key}`,
          error,
          { settingKey: key },
          event,
        );
      }
    }

    return useResponseSuccess(value);
  } catch (error) {
    logApiError(`get_system_setting_${key}`, error, undefined, event);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch system setting');
  }
});
