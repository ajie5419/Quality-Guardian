import { defineEventHandler, readBody } from 'h3';
import { FileStorageService } from '~/services/file-storage.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { buildKnowledgeUpdateData } from '~/utils/knowledge';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
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

  const id = getRequiredRouterParam(event, 'id', '缺少项目ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);

    await prisma.knowledge_base.update({
      where: { id },
      data: buildKnowledgeUpdateData(body as Record<string, unknown>),
    });

    if ((body as Record<string, unknown>).attachments !== undefined) {
      await FileStorageService.registerReferencesFromAttachments({
        attachments: (body as Record<string, unknown>).attachments,
        bizId: id,
        bizType: 'knowledge_base',
      });
    }

    return useResponseSuccess(null);
  } catch (error) {
    logApiError('knowledge', error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '知识条目不存在');
    }
    return internalServerErrorResponse(event, '更新失败');
  }
});
