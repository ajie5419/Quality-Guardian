import { defineEventHandler, getQuery } from 'h3';
import { z } from 'zod';
import { TaskDispatchService } from '~/modules/task-dispatch/task-dispatch.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useListResponseSuccess,
} from '~/utils/response';

const querySchema = z.object({
  all: z.string().optional(),
  level: z.string().optional(),
  parentId: z.string().optional(),
  status: z.string().optional(),
});

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  const query = querySchema.parse(getQuery(event));

  try {
    const items = await TaskDispatchService.list({
      all: query.all,
      level: query.level ? Number.parseInt(query.level, 10) : undefined,
      parentId: query.parentId,
      status: query.status,
      userinfo,
    });
    return useListResponseSuccess(items);
  } catch (error) {
    logApiError('task-dispatch', error, undefined, event);
    if (error instanceof Error && error.message === 'CURRENT_USER_NOT_FOUND')
      return badRequestResponse(event, '无法识别当前用户');
    return internalServerErrorResponse(
      event,
      'Failed to fetch task dispatch list',
    );
  }
});
