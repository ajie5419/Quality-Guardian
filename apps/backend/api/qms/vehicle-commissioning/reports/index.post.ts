import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { VehicleCommissioningService } from '~/modules/vehicle-commissioning/vehicle-commissioning.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const bodySchema = z.object({
  date: z.string().min(1),
  issueIds: z.array(z.string()).optional(),
  mainWorks: z.array(z.string()).min(1),
  notes: z.string().optional(),
  projectName: z.string().min(1),
  reporters: z.array(z.string()).min(1),
  workOrderNumber: z.string().optional(),
});

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = bodySchema.parse(await readBody(event));
    return useResponseSuccess(
      await VehicleCommissioningService.createDailyReport({
        date: body.date,
        issueIds: body.issueIds || [],
        mainWorks: body.mainWorks,
        notes: body.notes,
        projectName: body.projectName,
        reporters: body.reporters,
        workOrderNumber: body.workOrderNumber,
      }),
    );
  } catch (error) {
    logApiError(
      'vehicle-commissioning-reports-create',
      error,
      undefined,
      event,
    );
    return internalServerErrorResponse(event, 'Failed to create daily report');
  }
});
