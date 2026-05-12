import { defineEventHandler } from 'h3';
import { FileStorageService } from '~/services/file-storage.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
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
    await prisma.knowledge_base.update({
      where: { id },
      data: { isDeleted: true },
    });
    await FileStorageService.softDeleteReferences({
      bizId: String(id),
      bizType: 'knowledge_base',
    });

    return useResponseSuccess(null);
  } catch (error) {
    logApiError('knowledge', error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '知识条目不存在');
    }
    return internalServerErrorResponse(event, '删除失败');
  }
});
