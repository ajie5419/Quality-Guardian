import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';
import { normalizeTaskDispatchStatus } from '~/utils/task-dispatch';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    setResponseStatus(event, 400);
    return useResponseError('ID required');
  }

  const body = (await readBody(event)) as { status?: unknown };
  const status = normalizeTaskDispatchStatus(body?.status);
  if (!status) {
    setResponseStatus(event, 400);
    return useResponseError('Invalid status');
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
    const errorCode = (error as { code?: string }).code;
    setResponseStatus(event, errorCode === 'P2025' ? 404 : 500);
    return useResponseError(
      errorCode === 'P2025' ? 'Task not found' : 'Update failed',
    );
  }
});
