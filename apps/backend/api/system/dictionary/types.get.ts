import { defineEventHandler } from 'h3';
import { DictionaryService } from '~/modules/dictionary/dictionary.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const items = DictionaryService.getSupportedTypes();
    return useResponseSuccess(items);
  } catch (error: unknown) {
    logApiError('dictionary-types', error, undefined, event);
    return internalServerErrorResponse(event, '获取字典类型失败');
  }
});
