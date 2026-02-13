import { defineEventHandler, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredRouterParam(event, 'id', '缺少供应商ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await prisma.suppliers.update({
      where: { id },
      data: {
        isDeleted: true,
        updatedAt: new Date(),
      },
    });

    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('supplier', error);
    setResponseStatus(event, isPrismaNotFoundError(error) ? 404 : 500);
    return useResponseError(
      isPrismaNotFoundError(error) ? '供应商不存在' : '删除供应商失败',
    );
  }
});
