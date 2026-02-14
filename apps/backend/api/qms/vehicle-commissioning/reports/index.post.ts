import { defineEventHandler, readBody } from 'h3';
import { VehicleCommissioningService } from '~/services/vehicle-commissioning.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = (await readBody(event)) as Record<string, unknown>;
    const date = body.date ? String(body.date) : '';
    const projectName = body.projectName ? String(body.projectName) : '';
    const reporters = Array.isArray(body.reporters)
      ? body.reporters.map(String).filter(Boolean)
      : [];
    const mainWorks = Array.isArray(body.mainWorks)
      ? body.mainWorks.map(String).filter(Boolean)
      : [];

    if (
      !date ||
      !projectName ||
      reporters.length === 0 ||
      mainWorks.length === 0
    ) {
      return badRequestResponse(event, '日期、项目、汇报人、主要工作为必填');
    }

    const created = await VehicleCommissioningService.createDailyReport({
      date,
      issueIds: Array.isArray(body.issueIds)
        ? body.issueIds.map(String).filter(Boolean)
        : [],
      mainWorks,
      notes: body.notes ? String(body.notes) : undefined,
      projectName,
      reporters,
    });

    return useResponseSuccess(created);
  } catch (error) {
    logApiError('vehicle-commissioning-reports-create', error);
    return internalServerErrorResponse(event, 'Failed to create daily report');
  }
});
