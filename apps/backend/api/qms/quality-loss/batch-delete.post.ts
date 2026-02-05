import { defineEventHandler, readBody } from 'h3';
import { QualityLossService } from '~/services/quality-loss.service';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { ids } = body;
    const result = await QualityLossService.batchDelete(ids);
    return useResponseSuccess({ successCount: result.count });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return useResponseError(errorMessage);
  }
});
