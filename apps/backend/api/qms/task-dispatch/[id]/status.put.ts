import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import prisma from '~/utils/prisma';
import { useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id;
  const body = await readBody(event);
  const { status } = body;

  if (!id) return { code: -1, message: 'ID required' };

  try {
    const updatedTask = await prisma.qms_task_dispatches.update({
      where: { id: String(id) },
      data: {
        status: String(status),
        updatedAt: new Date(),
      },
    });

    return useResponseSuccess(updatedTask);
  } catch (error) {
    logApiError('status', error);
    return { code: -1, message: 'Update failed' };
  }
});
