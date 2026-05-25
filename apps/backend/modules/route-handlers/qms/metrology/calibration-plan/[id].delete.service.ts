import { defineEventHandler, getRouterParam } from 'h3';
import { MetrologyCalibrationPlanService } from '~/modules/metrology/calibration-plan/metrology-calibration-plan.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { verifyAccessToken } from '~/utils/jwt-utils';
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
    const deleted = await MetrologyCalibrationPlanService.deleteById(
      id,
      userinfo.username,
    );

    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'DELETE',
      targetType: 'metrology_calibration_plan',
      targetId: String(id),
      detailsTemplate:
        '删除计量校准计划: {{instrumentId}} ({{planYear}}-{{planMonth}})',
      detailsVariables: {
        instrumentId: deleted.instrumentId,
        planMonth: deleted.planMonth,
        planYear: deleted.planYear,
      },
    });

    return useResponseSuccess(null);
  } catch (error) {
    logApiError('metrology-calibration-plan-delete', error, undefined, event);
    if (
      error instanceof Error &&
      error.message.includes('Record to update not found')
    ) {
      return notFoundResponse(event, '校准计划不存在');
    }
    return internalServerErrorResponse(event, '删除校准计划失败');
  }
});
