import { defineEventHandler, getQuery } from 'h3';

import { getAvailableYears } from '~/modules/data-lifecycle';
import { logApiError } from '~/utils/api-logger';
import { useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const scopes = typeof query.scopes === 'string' && query.scopes.length > 0
      ? query.scopes.split(',').map((scope) => scope.trim()).filter(Boolean)
      : [];
    const years = await getAvailableYears(scopes);
    return useResponseSuccess(years);
  } catch (error) {
    logApiError('common-years', error, undefined, event);
    return useResponseSuccess([]);
  }
});
