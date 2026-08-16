import { KNOWLEDGE_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { KnowledgeRouteService } from '~/modules/knowledge/knowledge-route.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import {
  isPrismaNotFoundError,
  isPrismaUniqueConstraintError,
} from '~/utils/prisma-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

const updateKnowledgeCategorySchema = z.record(z.string(), z.unknown());

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, KNOWLEDGE_PERMISSION_CODES.EDIT);
  const id = getRequiredRouterParam(event, 'id', '缺少分类ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = updateKnowledgeCategorySchema.parse(await readBody(event));
    await KnowledgeRouteService.updateCategoryById(id, body);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('categories', error, undefined, event);
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '分类名称已存在');
    }
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '分类不存在');
    }
    return internalServerErrorResponse(event, '更新分类失败');
  }
});
