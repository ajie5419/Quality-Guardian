import { defineEventHandler, readBody } from 'h3';
import { MetrologyCalibrationPlanService } from '~/services/metrology-calibration-plan.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
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
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('metrology-calibration-plan-import', error);
    return internalServerErrorResponse(event, '导入校准计划失败');
  }
});
