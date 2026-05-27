import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { KnowledgeRouteService } from '~/modules/knowledge/knowledge-route.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const createKnowledgeSchema = z.record(z.string(), z.unknown());

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  try {
    const body = createKnowledgeSchema.parse(await readBody(event));
    const newItem = await KnowledgeRouteService.create(body, userinfo);
    return useResponseSuccess(newItem);
  } catch (error) {
    logApiError('knowledge', error, undefined, event);
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '沉淀失败: 文档编号已存在');
    }
    return internalServerErrorResponse(
      event,
      `沉淀失败: ${error instanceof Error ? error.message : '未知错误'}`,
    );
  }
});
