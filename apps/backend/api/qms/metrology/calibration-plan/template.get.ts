import { defineEventHandler, setHeader } from 'h3';
import { MetrologyCalibrationPlanService } from '~/services/metrology-calibration-plan.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(
      MetrologyCalibrationPlanService.getTemplateRows(),
    );
    XLSX.utils.book_append_sheet(workbook, sheet, 'Template');
    const buffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'buffer',
    });

    setHeader(
      event,
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    setHeader(
      event,
      'Content-Disposition',
      'attachment; filename="metrology-calibration-plan-template.xlsx"',
    );
    return buffer;
  } catch (error) {
    logApiError('metrology-calibration-plan-template', error);
    return internalServerErrorResponse(
      event,
      'Failed to generate metrology calibration plan template',
    );
  }
});
