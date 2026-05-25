import { z } from 'zod';
import { VehicleCommissioningService } from '~/modules/vehicle-commissioning/vehicle-commissioning.service';
import { logApiError } from '~/utils/api-logger';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const vehicleCommissioningIssuesQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  vehicleCommissioningIssuesQuerySchema,
  async (event, query) => {
    const userinfo = verifyAccessToken(event);
    if (!userinfo) {
      return unAuthorizedResponse(event);
    }

    try {
      const data = await VehicleCommissioningService.getIssues({
        date: query.date ? String(query.date) : undefined,
        page: query.page ? Number(query.page) : undefined,
        pageSize: query.pageSize ? Number(query.pageSize) : undefined,
        projectName: query.projectName ? String(query.projectName) : undefined,
        status: query.status ? (String(query.status) as any) : undefined,
        workOrderNumber: query.workOrderNumber
          ? String(query.workOrderNumber)
          : undefined,
      });
      return useResponseSuccess(data);
    } catch (error) {
      logApiError('vehicle-commissioning-issues-list', error, undefined, event);
      return internalServerErrorResponse(event, 'Failed to fetch issues');
    }
  },
);
