import { defineEventHandler, readBody } from 'h3';
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
import { buildWelderCreateData } from '~/utils/welder';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = (await readBody(event)) as Record<string, unknown>;
    const createData = buildWelderCreateData(body);
    if (!createData) {
      return badRequestResponse(event, '缺少必填字段: name/team');
    }

    const record = await prisma.welders.create({
      data: createData,
    });
    return useResponseSuccess(record);
  } catch (error: unknown) {
    logApiError('welder', error);
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '焊工数据已存在');
    }
    return internalServerErrorResponse(event, '创建焊工失败');
  }
});
