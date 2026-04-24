import { defineEventHandler, readBody } from 'h3';
import { MetrologyService } from '~/services/metrology.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';
import {
  badRequestResponse,
  conflictResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody(event);
    const data = MetrologyService.buildMutationPayload(
      body as Record<string, unknown>,
    );

    const created = await prisma.measuring_instruments.create({
      data: {
        ...data,
        createdBy: userinfo.username,
        updatedBy: userinfo.username,
      },
    });

    return useResponseSuccess(created);
  } catch (error: unknown) {
    logApiError('metrology-create', error);
    if (
      error instanceof Error &&
      (error.message === '量具名称不能为空' ||
        error.message === '编号不能为空' ||
        error.message === '有效期格式无效')
    ) {
      return badRequestResponse(event, error.message);
    }
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '编号已存在');
    }
    return internalServerErrorResponse(event, '新建计量器具失败');
  }
});
