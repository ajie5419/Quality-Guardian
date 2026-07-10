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
    try {
      const userinfo = getCurrentUser(event);
      await InspectionIssueAccessService.ensurePermission(
        userinfo,
        INSPECTION_ISSUE_PERMISSION_CODES.LIST,
      );
      const result = await InspectionService.getIssueStats({
        dateMode: parseInspectionIssueDateMode(query.dateMode),
        dateValue: parseInspectionIssueDateValue(query.dateValue),
        userContext: {
          roles: userinfo.roles,
          userId: String(userinfo.id || userinfo.userId || ''),
        },
        year: parseOptionalIssueYear(query.year),
      });
      return useResponseSuccess(result);
    } catch (error) {
      logApiError('inspection-issue-stats', error, undefined, event);
      const businessError = legacyErrorToBusinessError(error);
      if (businessError) return businessErrorResponse(event, businessError);
      return internalServerErrorResponse(event, 'Failed to fetch issue stats');
    }
  },
);
