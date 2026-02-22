import { eventHandler, getRouterParam, readBody, setResponseStatus } from 'h3';
import { PreferenceService } from '~/services/preference.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';
import { requireSystemAdmin } from '~/utils/system-auth';

export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

  const key = getRouterParam(event, 'key');
  if (!key) {
    setResponseStatus(event, 400);
    return useResponseError('Missing key parameter');
  }

  try {
    const body = await readBody(event);
    const { value, description } = body;

    const valStr = typeof value === 'string' ? value : JSON.stringify(value);
    await PreferenceService.setSystemSetting(key, valStr, description);

    // If saving a chart default, clear all user preferences to force sync
    switch (key) {
      case 'qms:after_sales:default_charts': {
        await PreferenceService.clearAllUserPreferences('after-sales-charts');

        break;
      }
      case 'qms:inspection_issues:default_charts': {
        await PreferenceService.clearAllUserPreferences(
          'inspection-issues-charts',
        );

        break;
      }
      case 'qms:quality_loss:default_charts': {
        await PreferenceService.clearAllUserPreferences('quality-loss-charts');

        break;
      }
      // No default
    }

    return useResponseSuccess({ message: 'System setting saved' });
  } catch (error) {
    logApiError(`save_system_setting_${key}`, error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to save system setting');
  }
});
