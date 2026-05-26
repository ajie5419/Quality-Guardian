import { defineEventHandler, readBody } from 'h3';
import { MetrologyCalibrationPlanService } from '~/modules/metrology/calibration-plan/metrology-calibration-plan.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { getCurrentUser } from '~/utils/current-user';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  try {
    const body = await readBody<{
      fileName?: string;
      items?: unknown[];
      year?: number;
    }>(event);
    const year = Number(body.year || 0);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return badRequestResponse(event, '计划年份无效');
    }

    const result = await MetrologyCalibrationPlanService.importItems(
      year,
      body.items || [],
      userinfo.username,
      body.fileName,
    );
    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'CREATE',
      targetType: 'metrology_calibration_plan',
      targetId: `batch-import-${year}`,
      detailsTemplate: '导入计量校准计划: {{successCount}}/{{totalCount}} 条',
      detailsVariables: {
        successCount: result.successCount,
        totalCount: result.totalCount,
      },
    });
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('metrology-calibration-plan-import', error, undefined, event);
    return internalServerErrorResponse(event, '导入校准计划失败');
  }
});
