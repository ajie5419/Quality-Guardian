import { QMS_DICTIONARY_TYPE_KEYS } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { DictionaryService } from '~/services/dictionary.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const items = await DictionaryService.getOptions(
      QMS_DICTIONARY_TYPE_KEYS.inspectionProcessName,
    );
    return useResponseSuccess(items);
  } catch (error) {
    logApiError(
      'public-inspection-request-process-dictionary-options',
      error,
      undefined,
      event,
    );
    return internalServerErrorResponse(event, '获取工序字典选项失败');
  }
});
