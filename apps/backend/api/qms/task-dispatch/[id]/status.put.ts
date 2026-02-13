import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  badRequestResponse,
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';
import { normalizeTaskDispatchStatus } from '~/utils/task-dispatch';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') {
    return id;
  }

  const body = (await readBody(event)) as { status?: unknown };
  const status = normalizeTaskDispatchStatus(body?.status);
  if (!status) {
    return badRequestResponse(event, 'Invalid status');
  }

  try {
    const updatedTask = await prisma.qms_task_dispatches.update({
      where: { id: String(id) },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    return useResponseSuccess(updatedTask);
  } catch (error: unknown) {
    logApiError('status', error);
    setResponseStatus(event, isPrismaNotFoundError(error) ? 404 : 500);
    return useResponseError(
      isPrismaNotFoundError(error) ? 'Task not found' : 'Update failed',
    );
  }
});
