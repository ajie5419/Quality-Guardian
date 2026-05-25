import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { KnowledgeRouteService } from '~/modules/knowledge/knowledge-route.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isPrismaUniqueConstraintError } from '~/utils/db-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const createKnowledgeCategorySchema = z.record(z.string(), z.unknown());

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = createKnowledgeCategorySchema.parse(await readBody(event));
    const newCategory = await KnowledgeRouteService.upsertCategory(body);
    return useResponseSuccess(newCategory);
  } catch (error) {
    logApiError('categories', error, undefined, event);
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '分类名称已存在');
    }
    return internalServerErrorResponse(event, '创建分类失败');
  }
});
