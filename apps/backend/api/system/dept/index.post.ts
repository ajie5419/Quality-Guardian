import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody(event);

    const newDept = await prisma.departments.create({
      data: {
        id: `dept-${Date.now()}`,
        name: body.name,
        parentId: body.parentId || body.pid || '0', // Frontend might send pid or parentId
        businessUnit: body.businessUnit || null,
        description: body.remark || body.description || null,
        status: body.status ?? 1,
        sort: Number(body.orderNo || body.sort || 0),
        isDeleted: false,
        updatedAt: new Date(),
      },
    });

    return useResponseSuccess(newDept);
  } catch (error) {
    logApiError('dept', error);
    return useResponseError('创建部门失败');
  }
});
