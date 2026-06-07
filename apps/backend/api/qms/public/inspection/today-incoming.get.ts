import { defineEventHandler } from 'h3';
import { InspectionPublicQueryService } from '~/modules/inspection/inspection-public-query.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    return useResponseSuccess(
      await InspectionPublicQueryService.getTodayIncomingInspections(),
    );
  } catch (error) {
    logApiError(
      'public-inspection-today-incoming',
      error,
      undefined,
      event,
    );
    return internalServerErrorResponse(event, '获取今日外购件检验情况失败');
  }
});
