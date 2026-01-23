import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const id = getRouterParam(event, 'id');
  const body = await readBody(event);

  try {
    const updated = await prisma.doc_projects.update({
      where: { id },
      data: {
        status: body.status,
        projectName: body.projectName,
        updatedAt: new Date(),
      },
    });
    return useResponseSuccess(updated);
  } catch {
    return useResponseError('更新失败');
  }
});
