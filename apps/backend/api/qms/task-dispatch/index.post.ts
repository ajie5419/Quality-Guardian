import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import {
  getTaskDispatchErrorMessage,
  TaskDispatchService,
} from '~/modules/task-dispatch/task-dispatch.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const bodySchema = z
  .object({
    assigneeId: z.unknown().optional(),
    title: z.unknown().optional(),
    type: z.unknown().optional(),
  })
  .passthrough();

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  const body = bodySchema.parse(await readBody(event));
  if (!body.type || !body.title || !body.assigneeId)
    return badRequestResponse(event, '缺少必填字段: type/title/assigneeId');

  try {
    return useResponseSuccess(
      await TaskDispatchService.create({ body, userinfo }),
    );
  } catch (error: unknown) {
    logApiError('task-dispatch', error, undefined, event);
    if (error instanceof Error) {
      const mappedMessage = getTaskDispatchErrorMessage(error.message);
      if (mappedMessage) return badRequestResponse(event, mappedMessage);
    }
    return internalServerErrorResponse(event, '派发失败: 数据库写入异常');
  }
});
