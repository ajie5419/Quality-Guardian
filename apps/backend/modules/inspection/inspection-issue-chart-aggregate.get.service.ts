import { INSPECTION_ISSUE_PERMISSION_CODES } from '@qgs/shared';
import { z } from 'zod';
import {
  parseInspectionIssueDateMode,
  parseInspectionIssueDateValue,
  parseOptionalIssueYear,
} from '~/modules/inspection/inspection-issue';
import { InspectionIssueAccessService } from '~/modules/inspection/inspection-issue-access.service';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { logApiError } from '~/utils/api-logger';
import {
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
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
const schema = z.object({}).passthrough();

export default defineValidatedHandler(schema, async (event, query) => {
  const userinfo = getCurrentUser(event);
  const dimension = String(query.dimension || '').trim();
  const metric = String(query.metric || '').trim();
  const top = Number.parseInt(String(query.top || '15'), 10);
  if (!ALLOWED_DIMENSIONS.has(dimension) || !ALLOWED_METRICS.has(metric))
    return internalServerErrorResponse(event, 'Invalid chart aggregate params');

  try {
    await InspectionIssueAccessService.ensurePermission(
      userinfo,
      INSPECTION_ISSUE_PERMISSION_CODES.LIST,
    );
    const result = await InspectionService.getIssueChartAggregation({
      dateMode: parseInspectionIssueDateMode(query.dateMode),
      dateValue: parseInspectionIssueDateValue(query.dateValue),
      dimension: dimension as
        | 'claim'
        | 'defectSubtype'
        | 'defectType'
        | 'division'
        | 'projectName'
        | 'reportMonth'
        | 'responsibleDepartment'
        | 'severity'
        | 'status'
        | 'supplierName',
      metric: metric as 'count' | 'lossAmount' | 'quantity',
      top: Number.isNaN(top) ? 15 : top,
      year: parseOptionalIssueYear(query.year),
      userContext: {
        userId: String(userinfo.id || userinfo.userId || ''),
        username: userinfo.username,
      },
      dataScope: event.context.dataScope,
    });
    return useResponseSuccess({ items: result });
  } catch (error) {
    logApiError('inspection-issue-chart-aggregate', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) return businessErrorResponse(event, businessError);
    return internalServerErrorResponse(
      event,
      'Failed to fetch inspection issue chart aggregate',
    );
  }
});
