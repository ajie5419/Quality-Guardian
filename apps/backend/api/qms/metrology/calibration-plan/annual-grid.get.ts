import { defineEventHandler, getQuery } from 'h3';
import { MetrologyCalibrationPlanService } from '~/modules/metrology/calibration-plan/metrology-calibration-plan.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const result = await MetrologyCalibrationPlanService.getAnnualGrid({
      keyword: String(query.keyword || '').trim() || undefined,
      usingUnit: String(query.usingUnit || '').trim() || undefined,
      year: Number(query.year || 0) || undefined,
    });
    return useResponseSuccess(result);
  } catch (error) {
    logApiError(
      'metrology-calibration-plan-annual-grid',
      error,
      undefined,
      event,
    );
    return internalServerErrorResponse(
      event,
      'Failed to fetch metrology calibration annual grid',
    );
  }
});
