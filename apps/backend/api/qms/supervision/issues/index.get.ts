import { z } from 'zod';
import { SupervisionService } from '~/modules/supervision/supervision.service';
import { logApiError } from '~/utils/api-logger';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const supervisionIssuesQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  supervisionIssuesQuerySchema,
  async (event, query) => {
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
