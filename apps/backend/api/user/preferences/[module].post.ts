import { eventHandler, getRouterParam, readBody, setResponseStatus } from 'h3';
import { PreferenceService } from '~/modules/user/preference.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default eventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  const module = getRouterParam(event, 'module');
  if (!module) {
    setResponseStatus(event, 400);
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
    logApiError(`save_preference_${module}`, error, undefined, event);
    setResponseStatus(event, 500);
    return useResponseError('Failed to save preference');
  }
});
