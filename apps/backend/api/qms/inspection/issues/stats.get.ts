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

export default defineValidatedHandler(
  z.object({}).passthrough(),
  async (event, query) => {
    const year = parseOptionalIssueYear(query.year);
    const dateMode = parseInspectionIssueDateMode(query.dateMode);
    const dateValue = parseInspectionIssueDateValue(query.dateValue);

    try {
      await InspectionIssueAccessService.ensurePermission(
        getCurrentUser(event),
        INSPECTION_ISSUE_PERMISSION_CODES.LIST,
      );
      const result = await InspectionService.getIssueStats({
        dateMode,
        dateValue,
        year,
      });
      return useResponseSuccess(result);
    } catch (error) {
      logApiError('inspection-issue-stats', error, undefined, event);
      const businessError = legacyErrorToBusinessError(error);
      if (businessError) return businessErrorResponse(event, businessError);
      return internalServerErrorResponse(
        event,
        'Failed to fetch inspection issue stats',
      );
    }
  },
);
