import { eventHandler, getRouterParam, setResponseStatus } from 'h3';
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

  const module = getRouterParam(event, 'module');
  if (!module) {
    setResponseStatus(event, 400);
    return useResponseError('Missing module parameter');
  }

  try {
    await PreferenceService.deleteUserPreference(String(userinfo.id), module);
    return useResponseSuccess({ message: 'Preference reset to default' });
  } catch (error) {
    logApiError(`delete_preference_${module}`, error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to reset preference');
  }
});
