import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from 'h3';
import { logApiError } from '~/utils/api-logger';
import { normalizeBomText } from '~/utils/bom';
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
  if (!id) {
    setResponseStatus(event, 400);
    return useResponseError('ID required');
  }

  try {
    const body = await readBody(event);
    const updated = await prisma.bom_projects.update({
      where: { id },
      data: {
        status: normalizeBomText(body.status) || undefined,
        projectName: normalizeBomText(body.projectName) || undefined,
        updatedAt: new Date(),
      },
    });
    return useResponseSuccess(updated);
  } catch (error) {
    logApiError('bom-projects', error);
    setResponseStatus(
      event,
      (error as { code?: string }).code === 'P2025' ? 404 : 500,
    );
    return useResponseError('更新失败');
  }
});
