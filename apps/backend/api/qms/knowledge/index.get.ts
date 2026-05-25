import { defineEventHandler, getQuery } from 'h3';
import { KnowledgeRouteService } from '~/modules/knowledge/knowledge-route.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const { categoryId, keyword, page = 1, pageSize = 10 } = getQuery(event);

  try {
    const result = await KnowledgeRouteService.getList({
      categoryId,
      keyword,
      page,
      pageSize,
    });
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('knowledge', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to fetch knowledge list');
  }
});
