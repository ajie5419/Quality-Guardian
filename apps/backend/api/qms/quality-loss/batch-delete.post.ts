import { defineEventHandler, readBody } from 'h3';
import { QualityLossService } from '~/services/quality-loss.service';
import { logApiError } from '~/utils/api-logger';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { ids } = body;
    const result = await QualityLossService.batchDelete(ids);
    return useResponseSuccess({ successCount: result.count });
  } catch (error: unknown) {
    logApiError('quality-loss-batch-delete', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return useResponseError(errorMessage);
  }
});
