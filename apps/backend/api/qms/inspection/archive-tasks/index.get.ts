import { defineEventHandler, getQuery } from 'h3';
import { z } from 'zod';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const schema = z.object({}).passthrough();

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  try {
    const query = schema.parse(getQuery(event));
    const result = await InspectionService.getArchiveTasks({
      date: String(query.date || '').trim() || undefined,
      inspector: String(query.inspector || userinfo.username || '').trim(),
      page: Number(query.page || 1),
      pageSize: Number(query.pageSize || 20),
      status: (String(query.status || '').trim() || undefined) as
        | 'ARCHIVED'
        | 'IN_PROGRESS'
        | 'PENDING'
        | 'REJECTED'
        | undefined,
    });
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('inspection-archive-tasks', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to fetch archive tasks');
  }
});
