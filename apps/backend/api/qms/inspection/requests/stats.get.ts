import { defineEventHandler, getQuery } from 'h3';
import { z } from 'zod';
import { InspectionRouteService } from '~/modules/inspection/inspection-route.service';
import { logApiError } from '~/utils/api-logger';
import { getAnalyticsAccessContext } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const statsQuerySchema = z.object({
  endDate: z.string().optional(),
  period: z.string().optional(),
  startDate: z.string().optional(),
});

export default defineEventHandler(async (event) => {
  const query = statsQuerySchema.parse(getQuery(event));

  try {
    return useResponseSuccess(
      await InspectionRouteService.getRequestStats(query, {
        ...getAnalyticsAccessContext(event),
        dataScope: event.context.dataScope,
      }),
    );
  } catch (error) {
    logApiError('inspection-request-stats', error, undefined, event);
    return internalServerErrorResponse(event, '获取报检任务统计失败');
  }
});
