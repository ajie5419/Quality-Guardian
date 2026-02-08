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

  const module = getRouterParam(event, 'module');
  if (!module) {
    return useResponseError('Missing module parameter');
  }

  try {
    const body = await readBody(event);
    const data = body.data;

    await PreferenceService.setUserPreference(
      String(userinfo.id),
      module,
      data,
    );

    return useResponseSuccess({ message: 'Preference saved' });
  } catch (error) {
    logApiError(`save_preference_${module}`, error);
    return useResponseError('Failed to save preference');
  }
});
