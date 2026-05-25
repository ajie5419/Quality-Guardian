import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { KnowledgeRouteService } from '~/modules/knowledge/knowledge-route.service';
import { logApiError } from '~/utils/api-logger';
import { isPrismaNotFoundError } from '~/utils/db-error';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

const updateKnowledgeSchema = z.record(z.string(), z.unknown());

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredRouterParam(event, 'id', '缺少项目ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = updateKnowledgeSchema.parse(await readBody(event));
    await KnowledgeRouteService.updateById(id, body);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('knowledge', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '知识条目不存在');
    }
    return internalServerErrorResponse(event, '更新失败');
  }
});
