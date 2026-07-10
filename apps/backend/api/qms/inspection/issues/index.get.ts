import { INSPECTION_ISSUE_PERMISSION_CODES } from '@qgs/shared';
import { z } from 'zod';
import { parseInspectionIssueListQuery } from '~/modules/inspection/inspection-issue';
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

const inspectionIssuesQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  inspectionIssuesQuerySchema,
  async (event, query) => {
    const userinfo = getCurrentUser(event);
    const params = parseInspectionIssueListQuery(query);
    try {
      await InspectionIssueAccessService.ensurePermission(
        userinfo,
        INSPECTION_ISSUE_PERMISSION_CODES.LIST,
      );
      const result = await InspectionService.getIssues({
        ...params,
        userContext: {
          userId: String(userinfo.id || userinfo.userId || ''),
          username: userinfo.username,
        },
        dataScope: event.context.dataScope,
      });

      return useResponseSuccess(result);
    } catch (error) {
      logApiError('issues', error, undefined, event);
      const businessError = legacyErrorToBusinessError(error);
      if (businessError) return businessErrorResponse(event, businessError);
      return internalServerErrorResponse(
        event,
        'Failed to fetch inspection issues',
      );
    }
  },
);
