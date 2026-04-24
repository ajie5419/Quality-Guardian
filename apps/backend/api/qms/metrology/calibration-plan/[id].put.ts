import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { MetrologyCalibrationPlanService } from '~/services/metrology-calibration-plan.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';
import {
  badRequestResponse,
  conflictResponse,
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

    const body = await readBody(event);
    const data = MetrologyCalibrationPlanService.buildMutationPayload(
      body as Record<string, unknown>,
    );

    await prisma.metrology_calibration_plans.update({
      where: { id },
      data: {
        ...data,
        updatedBy: userinfo.username,
      },
    });

    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('metrology-calibration-plan-update', error);
    if (
      error instanceof Error &&
      [
        '实际完成日期格式无效',
        '计划年份不能为空',
        '计划年份超出范围',
        '计划日期不能为空',
        '计划日期无效',
        '计划日期超出范围',
        '计划月份不能为空',
        '计划月份超出范围',
        '计量器具不能为空',
      ].includes(error.message)
    ) {
      return badRequestResponse(event, error.message);
    }
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '该月份计划已存在');
    }
    return internalServerErrorResponse(event, '编辑校准计划失败');
  }
});
