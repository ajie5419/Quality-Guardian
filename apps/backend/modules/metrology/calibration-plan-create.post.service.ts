import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { MetrologyCalibrationPlanService } from '~/modules/metrology/calibration-plan/metrology-calibration-plan.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';
import {
  badRequestResponse,
  conflictResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const createCalibrationPlanSchema = z.record(z.string(), z.unknown());

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  try {
    const body = createCalibrationPlanSchema.parse(await readBody(event));
    const created = await MetrologyCalibrationPlanService.create(
      body,
      userinfo.username,
    );

    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'CREATE',
      targetType: 'metrology_calibration_plan',
      targetId: String(created.id),
      detailsTemplate:
        '新增计量校准计划: {{instrumentId}} ({{planYear}}-{{planMonth}})',
      detailsVariables: {
        instrumentId: created.instrumentId,
        planMonth: created.planMonth,
        planYear: created.planYear,
      },
    });

    return useResponseSuccess(created);
  } catch (error: unknown) {
    logApiError('metrology-calibration-plan-create', error, undefined, event);
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
