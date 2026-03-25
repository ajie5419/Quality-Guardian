import { defineEventHandler, readBody } from 'h3';
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
import { buildWelderUpdateData } from '~/utils/welder';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredRouterParam(event, 'id', '缺少焊工ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = (await readBody(event)) as Record<string, unknown>;
    await prisma.welders.update({
      where: { id },
      data: buildWelderUpdateData(body),
    });
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('welder', error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '焊工不存在');
    }
    return internalServerErrorResponse(event, '更新焊工失败');
  }
});
