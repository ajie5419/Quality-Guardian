import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { parseNonEmptyIdList } from '~/utils/id-list';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  badRequestResponse,
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
    const body = (await readBody(event)) as { ids?: unknown };
    const ids = parseNonEmptyIdList(body.ids);

    if (!ids) {
      return badRequestResponse(event, '请提供有效的 ID 列表');
    }

    const result = await prisma.measuring_instruments.updateMany({
      where: {
        id: { in: ids },
        isDeleted: false,
      },
      data: {
        isDeleted: true,
        updatedAt: new Date(),
        updatedBy: userinfo.username,
      },
    });

    return useResponseSuccess({ count: result.count });
  } catch (error) {
    logApiError('metrology-batch-delete', error);
    return internalServerErrorResponse(event, '批量删除计量器具失败');
  }
});
