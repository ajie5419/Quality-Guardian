import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { TaskDispatchService } from '~/modules/task-dispatch/task-dispatch.service';
import { logApiError } from '~/utils/api-logger';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';
import { normalizeTaskDispatchStatus } from '~/utils/task-dispatch';

const bodySchema = z.object({ status: z.unknown().optional() });

export default defineEventHandler(async (event) => {
  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') {
    return id;
  }

  const body = bodySchema.parse(await readBody(event));
  const status = normalizeTaskDispatchStatus(body?.status);
  if (!status) {
    return badRequestResponse(event, 'Invalid status');
  }

  try {
    return useResponseSuccess(
      await TaskDispatchService.updateStatus(String(id), status),
    );
  } catch (error: unknown) {
    logApiError('status', error, undefined, event);
    return internalServerErrorResponse(event, 'Update failed');
  }
});
