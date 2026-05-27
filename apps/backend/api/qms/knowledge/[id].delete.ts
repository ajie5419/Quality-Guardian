import { defineEventHandler } from 'h3';
import { KnowledgeRouteService } from '~/modules/knowledge/knowledge-route.service';
import { logApiError } from '~/utils/api-logger';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const id = getRequiredRouterParam(event, 'id', '缺少项目ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await KnowledgeRouteService.deleteById(id);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('knowledge', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '知识条目不存在');
    }
    return internalServerErrorResponse(event, '删除失败');
  }
});
