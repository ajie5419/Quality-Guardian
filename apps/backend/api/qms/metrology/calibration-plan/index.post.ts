import { defineEventHandler, readBody } from 'h3';
import { MetrologyCalibrationPlanService } from '~/services/metrology-calibration-plan.service';
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
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody(event);
    const data = MetrologyCalibrationPlanService.buildMutationPayload(
      body as Record<string, unknown>,
    );

    const created = await prisma.metrology_calibration_plans.create({
      data: {
        ...data,
        createdBy: userinfo.username,
        updatedBy: userinfo.username,
      },
    });

    return useResponseSuccess(created);
  } catch (error: unknown) {
    logApiError('metrology-calibration-plan-create', error);
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
    return internalServerErrorResponse(event, '新建校准计划失败');
  }
});
