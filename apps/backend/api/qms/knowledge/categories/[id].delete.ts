import { defineEventHandler } from 'h3';
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

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

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
