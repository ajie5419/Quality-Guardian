import { defineEventHandler, getQuery, setResponseStatus } from 'h3';
import { DictionaryService } from '~/modules/dictionary/dictionary.service';
import { logApiError } from '~/utils/api-logger';
import {
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import {
  badRequestResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const dictType = String(query.dictType || '').trim();
  if (!dictType) {
    return badRequestResponse(event, '缺少字典类型参数 dictType');
  }

  try {
    const items = await DictionaryService.getOptions(dictType);
    return useResponseSuccess(items);
  } catch (error: unknown) {
    logApiError('dictionary-options', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) {
      return businessErrorResponse(event, businessError);
    }
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch dictionary options');
  }
});
