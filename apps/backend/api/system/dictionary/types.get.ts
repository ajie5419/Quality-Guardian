import { defineEventHandler } from 'h3';
import { DictionaryService } from '~/services/dictionary.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const items = DictionaryService.getSupportedTypes();
    return useResponseSuccess(items);
  } catch (error: unknown) {
    logApiError('dictionary-types', error, undefined, event);
    return internalServerErrorResponse(event, '获取字典类型失败');
  }
});
