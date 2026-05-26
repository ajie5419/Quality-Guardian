import { z } from 'zod';
import {
  parseAfterSalesDateMode,
  parseAfterSalesDateValue,
} from '~/modules/after-sales/after-sales-query';
import { AfterSalesService } from '~/modules/after-sales/after-sales.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const afterSalesChartAggregateQuerySchema = z
  .object({
    dateMode: z.unknown().optional(),
    dateValue: z.unknown().optional(),
    dimension: z.enum([
      'defectSubtype',
      'defectType',
      'productSubtype',
      'productType',
      'reportMonth',
      'responsibleDept',
      'severity',
      'status',
      'supplierBrand',
    ]),
    metric: z.enum([
      'count',
      'laborTravelCost',
      'materialCost',
      'quantity',
      'runningHours',
      'totalLoss',
    ]),
    top: z.coerce.number().int().optional(),
    year: z.string().optional(),
  })
  .passthrough();

export default defineValidatedHandler(
  afterSalesChartAggregateQuerySchema,
  async (event, query) => {
    const userinfo = getCurrentUser(event);

    const dimension = query.dimension;
    const metric = query.metric;
    const top = query.top ?? 15;
    const yearRaw = String(query.year || '').trim();
    const year = yearRaw ? Number.parseInt(yearRaw, 10) : undefined;

    try {
      const data = await AfterSalesService.getChartAggregation({
        dateMode: parseAfterSalesDateMode(query.dateMode),
        dateValue: parseAfterSalesDateValue(query.dateValue),
        dimension,
        metric,
        top: Number.isNaN(top) ? 15 : top,
        year: Number.isNaN(year ?? Number.NaN) ? undefined : year,
        userContext: {
          userId: String(userinfo.id || userinfo.userId || ''),
          username: userinfo.username,
        },
      });
      return useResponseSuccess({ items: data });
    } catch (error) {
      logApiError('after-sales-chart-aggregate', error, undefined, event);
      return internalServerErrorResponse(
        event,
        'Failed to fetch after-sales chart aggregate',
      );
    }
  },
);
