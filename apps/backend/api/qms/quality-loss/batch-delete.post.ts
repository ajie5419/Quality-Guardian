import { defineEventHandler, readBody } from 'h3';
import { QualityLossService } from '~/services/quality-loss.service';
import { useResponseSuccess, useResponseError } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { ids } = body;
    const result = await QualityLossService.batchDelete(ids);
    return useResponseSuccess({ successCount: result.count });
  } catch (e: any) {
    return useResponseError(e.message);
  }
});
