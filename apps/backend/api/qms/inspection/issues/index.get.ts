import { z } from 'zod';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import { parseInspectionIssueListQuery } from '~/utils/inspection-issue';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const inspectionIssuesQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  inspectionIssuesQuerySchema,
  async (event, query) => {
    const userinfo = await verifyAccessToken(event);
    if (!userinfo) {
      return unAuthorizedResponse(event);
    }

    const params = parseInspectionIssueListQuery(query);

    try {
      const result = await InspectionService.getIssues({
        ...params,
        userContext: {
          userId: String(userinfo.id || userinfo.userId || ''),
          username: userinfo.username,
        },
      });

      return useResponseSuccess(result);
    } catch (error) {
      logApiError('issues', error, undefined, event);
      return internalServerErrorResponse(
        event,
        'Failed to fetch inspection issues',
      );
    }
  },
);
