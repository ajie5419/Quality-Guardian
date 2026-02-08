import { eventHandler, readBody, getRouterParam } from 'h3';
import { PreferenceService } from '~/services/preference.service';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { unAuthorizedResponse, useResponseSuccess, useResponseError } from '~/utils/response';
import { logApiError } from '~/utils/api-logger';

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

        await PreferenceService.setUserPreference(String(userinfo.id), module, data);

        return useResponseSuccess({ message: 'Preference saved' });
    } catch (error) {
        logApiError(`save_preference_${module}`, error);
        return useResponseError('Failed to save preference');
    }
});
