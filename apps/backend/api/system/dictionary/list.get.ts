import { defineEventHandler, getQuery, setResponseStatus } from 'h3';
import { DictionaryService } from '~/services/dictionary.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  usePageResponseSuccess,
  useResponseError,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const query = getQuery(event);
    const page = Number(query.page || 1);
    const pageSize = Number(query.pageSize || 20);
    const result = await DictionaryService.list({
      dictType: String(query.dictType || ''),
      keyword: String(query.keyword || ''),
      page,
      pageSize,
      status:
        query.status === undefined ||
        query.status === null ||
        query.status === ''
          ? undefined
          : Number(query.status),
    });

    return usePageResponseSuccess(page, pageSize, result.items, {
      total: result.total,
    });
  } catch (error) {
    logApiError('dictionary-list', error, undefined, event);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch dictionaries');
  }
});
