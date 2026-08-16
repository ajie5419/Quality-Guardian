import { KNOWLEDGE_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { KnowledgeRouteService } from '~/modules/knowledge/knowledge-route.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const createKnowledgeCategorySchema = z.record(z.string(), z.unknown());

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, KNOWLEDGE_PERMISSION_CODES.CREATE);
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
