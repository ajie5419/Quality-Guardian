import { z } from 'zod';
import { parseInspectionIssueListQuery } from '~/modules/inspection/inspection-issue';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { logApiError } from '~/utils/api-logger';
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
