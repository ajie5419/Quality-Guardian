import { eventHandler, getQuery, getRouterParam, setResponseStatus } from 'h3';
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

  // 可通过 query 指定系统默认值的 key
  const query = getQuery(event);
  const systemKey = (query.systemKey as string) || `system_default:${module}`;

  try {
    const preference = await PreferenceService.getMergedPreference(
      String(userinfo.id),
      module,
      systemKey,
    );

    return useResponseSuccess(preference);
  } catch (error) {
    logApiError(`get_preference_${module}`, error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch preference');
  }
});
