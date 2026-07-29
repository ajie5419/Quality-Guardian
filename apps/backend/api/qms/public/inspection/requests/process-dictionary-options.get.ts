import { defineEventHandler } from 'h3';
import { ProcessMasterService } from '~/modules/process-master';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const items = await ProcessMasterService.listActiveOptions();
    return useResponseSuccess(
      items.map((item) => ({
        dictKey: item.name,
        dictValue: item.name,
        id: item.id,
        sort: item.sort,
      })),
    );
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
