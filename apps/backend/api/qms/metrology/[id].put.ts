import { defineEventHandler, readBody } from 'h3';
import { MetrologyService } from '~/services/metrology.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  isPrismaNotFoundError,
  isPrismaUniqueConstraintError,
} from '~/utils/prisma-error';
import {
  badRequestResponse,
  conflictResponse,
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

  const id = getRequiredRouterParam(event, 'id', '缺少计量器具ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);
    const data = MetrologyService.buildMutationPayload(
      body as Record<string, unknown>,
    );

    await prisma.measuring_instruments.update({
      where: { id },
      data: {
        ...data,
        updatedBy: userinfo.username,
      },
    });

    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('metrology-update', error);
    if (
      error instanceof Error &&
      (error.message === '量具名称不能为空' ||
        error.message === '编号不能为空' ||
        error.message === '有效期格式无效')
    ) {
      return badRequestResponse(event, error.message);
    }
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '计量器具不存在');
    }
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '编号已存在');
    }
    return internalServerErrorResponse(event, '更新计量器具失败');
  }
});
