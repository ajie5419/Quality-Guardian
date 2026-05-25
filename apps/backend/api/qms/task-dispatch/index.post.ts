import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { TaskDispatchService } from '~/modules/task-dispatch/task-dispatch.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const bodySchema = z
  .object({
    assigneeId: z.unknown().optional(),
    title: z.unknown().optional(),
    type: z.unknown().optional(),
  })
  .passthrough();

function mapDispatchErrorMessage(message: string) {
  if (message === 'CURRENT_USER_NOT_FOUND') return '无法识别当前操作人身份';
  if (message === 'ASSIGNEE_NOT_FOUND') return '受派人不存在';
  if (message === 'ITP_PROJECT_NOT_FOUND')
    return '关联的 ITP 计划不存在，请刷新后重试';
  if (message === 'LEVEL_TWO_PARENT_REQUIRED')
    return '二级任务必须提供父任务ID';
  if (message === 'PARENT_NOT_FOUND') return '父任务不存在';
  if (message === 'PARENT_LEVEL_INVALID') return '仅允许挂载到一级任务';
  return null;
}

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

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
      const mappedMessage = mapDispatchErrorMessage(error.message);
      if (mappedMessage) return badRequestResponse(event, mappedMessage);
    }
    return internalServerErrorResponse(event, '派发失败: 数据库写入异常');
  }
});
