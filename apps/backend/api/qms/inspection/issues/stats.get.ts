import { z } from 'zod';
import {
  parseInspectionIssueDateMode,
  parseInspectionIssueDateValue,
  parseOptionalIssueYear,
} from '~/modules/inspection/inspection-issue';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineValidatedHandler(
  z.object({}).passthrough(),
  async (event, query) => {
    const userinfo = await verifyAccessToken(event);
    if (!userinfo) {
      return unAuthorizedResponse(event);
    }

    const year = parseOptionalIssueYear(query.year);
    const dateMode = parseInspectionIssueDateMode(query.dateMode);
    const dateValue = parseInspectionIssueDateValue(query.dateValue);

    try {
      const result = await InspectionService.getIssueStats({
        dateMode,
        dateValue,
        year,
      });
      return useResponseSuccess(result);
    } catch (error) {
      logApiError('inspection-issue-stats', error, undefined, event);
      return internalServerErrorResponse(
        event,
        'Failed to fetch inspection issue stats',
      );
    }
  },
);
