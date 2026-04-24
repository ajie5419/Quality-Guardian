import { defineEventHandler, getRouterParam } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  badRequestResponse,
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = String(getRouterParam(event, 'id') || '').trim();
  if (!id) {
    return badRequestResponse(event, '计划ID不能为空');
  }

  try {
    const existing = await prisma.metrology_calibration_plans.findFirst({
      where: { id, isDeleted: false },
      select: { id: true },
    });

    if (!existing) {
      return notFoundResponse(event, '校准计划不存在');
    }

    await prisma.metrology_calibration_plans.update({
      where: { id },
      data: {
        isDeleted: true,
        updatedBy: userinfo.username,
      },
    });

    return useResponseSuccess(null);
  } catch (error) {
    logApiError('metrology-calibration-plan-delete', error);
    return internalServerErrorResponse(event, '删除校准计划失败');
  }
});
