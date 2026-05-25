import { z } from 'zod';
import { defineValidatedHandler } from '~/core/validation/define-validated-handler';
import { SupervisionService } from '~/services/supervision.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const supervisionIssuesQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  supervisionIssuesQuerySchema,
  async (event, query) => {
    const userinfo = verifyAccessToken(event);
    if (!userinfo) return unAuthorizedResponse(event);

    try {
      const data = await SupervisionService.listIssues({
        issueType: query.issueType ? String(query.issueType) : undefined,
        page: query.page ? Number(query.page) : undefined,
        pageSize: query.pageSize ? Number(query.pageSize) : undefined,
        projectId: query.projectId ? String(query.projectId) : undefined,
        status: query.status ? String(query.status) : undefined,
      });
      return useResponseSuccess(data);
    } catch (error) {
      logApiError('supervision-issues-list', error, undefined, event);
      return internalServerErrorResponse(
        event,
        'Failed to fetch supervision issues',
      );
    }
  },
);
