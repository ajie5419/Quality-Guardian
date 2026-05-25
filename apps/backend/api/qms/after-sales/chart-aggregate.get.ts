import { z } from 'zod';
import { AfterSalesService } from '~/modules/after-sales/after-sales.service';
import {
  parseAfterSalesDateMode,
  parseAfterSalesDateValue,
} from '~/utils/after-sales-query';
import { logApiError } from '~/utils/api-logger';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const ALLOWED_DIMENSIONS = new Set([
  'defectSubtype',
  'defectType',
  'productSubtype',
  'productType',
  'reportMonth',
  'responsibleDept',
  'severity',
  'status',
  'supplierBrand',
]);

const ALLOWED_METRICS = new Set([
  'count',
  'laborTravelCost',
  'materialCost',
  'quantity',
  'runningHours',
  'totalLoss',
]);

const afterSalesChartAggregateQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  afterSalesChartAggregateQuerySchema,
  async (event, query) => {
    const userinfo = await verifyAccessToken(event);
    if (!userinfo) return unAuthorizedResponse(event);

    const dimension = String(query.dimension || '').trim();
    const metric = String(query.metric || '').trim();
    const top = Number.parseInt(String(query.top || '15'), 10);
    const yearRaw = String(query.year || '').trim();
    const year = yearRaw ? Number.parseInt(yearRaw, 10) : undefined;

    if (!ALLOWED_DIMENSIONS.has(dimension) || !ALLOWED_METRICS.has(metric)) {
      return internalServerErrorResponse(
        event,
        'Invalid chart aggregate params',
      );
    }

    try {
      const data = await AfterSalesService.getChartAggregation({
        dateMode: parseAfterSalesDateMode(query.dateMode),
        dateValue: parseAfterSalesDateValue(query.dateValue),
        dimension: dimension as any,
        metric: metric as any,
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
