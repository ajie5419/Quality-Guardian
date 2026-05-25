import { defineEventHandler, getQuery, setResponseStatus } from 'h3';
import { DictionaryService } from '~/modules/dictionary/dictionary.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

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
    const message = error instanceof Error ? error.message : '获取字典选项失败';
    if (message.startsWith('VALIDATION:')) {
      return badRequestResponse(event, message.replace('VALIDATION:', ''));
    }
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch dictionary options');
  }
});
