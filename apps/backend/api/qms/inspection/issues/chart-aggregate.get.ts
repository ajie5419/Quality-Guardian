import { defineEventHandler, getQuery } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import {
  parseInspectionIssueDateMode,
  parseInspectionIssueDateValue,
  parseOptionalIssueYear,
} from '~/utils/inspection-issue';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const ALLOWED_DIMENSIONS = new Set([
  'claim',
  'defectSubtype',
  'defectType',
  'division',
  'projectName',
  'reportMonth',
  'responsibleDepartment',
  'severity',
  'status',
  'supplierName',
]);

const ALLOWED_METRICS = new Set(['count', 'lossAmount', 'quantity']);

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const query = getQuery(event) as Record<string, unknown>;
  const dimension = String(query.dimension || '').trim();
  const metric = String(query.metric || '').trim();
  const top = Number.parseInt(String(query.top || '15'), 10);

  if (!ALLOWED_DIMENSIONS.has(dimension) || !ALLOWED_METRICS.has(metric)) {
    return internalServerErrorResponse(event, 'Invalid chart aggregate params');
  }

  try {
    const result = await InspectionService.getIssueChartAggregation({
      dateMode: parseInspectionIssueDateMode(query.dateMode),
      dateValue: parseInspectionIssueDateValue(query.dateValue),
      dimension: dimension as any,
      metric: metric as any,
      top: Number.isNaN(top) ? 15 : top,
      year: parseOptionalIssueYear(query.year),
      userContext: {
        userId: String(userinfo.id || userinfo.userId || ''),
        username: userinfo.username,
      },
    });
    return useResponseSuccess({ items: result });
  } catch (error) {
    logApiError('inspection-issue-chart-aggregate', error);
    return internalServerErrorResponse(
      event,
      'Failed to fetch inspection issue chart aggregate',
    );
  }
});
