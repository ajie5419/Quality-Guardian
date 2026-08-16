import { KNOWLEDGE_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { KnowledgeRouteService } from '~/modules/knowledge/knowledge-route.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, KNOWLEDGE_PERMISSION_CODES.DELETE);
  const id = getRequiredRouterParam(event, 'id', '缺少分类ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await KnowledgeRouteService.deleteCategoryById(id);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('categories', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '分类不存在');
    }
    return internalServerErrorResponse(event, '删除分类失败');
  }
});
