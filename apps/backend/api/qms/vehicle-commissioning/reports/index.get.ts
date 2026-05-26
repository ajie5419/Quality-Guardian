import { z } from 'zod';
import { VehicleCommissioningService } from '~/modules/vehicle-commissioning/vehicle-commissioning.service';
import { logApiError } from '~/utils/api-logger';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineValidatedHandler(
  z.object({}).passthrough(),
  async (event, query) => {
    try {
      const data = await VehicleCommissioningService.getDailyReports({
        dateFrom: query.dateFrom ? String(query.dateFrom) : undefined,
        dateTo: query.dateTo ? String(query.dateTo) : undefined,
        page: query.page ? Number(query.page) : undefined,
        pageSize: query.pageSize ? Number(query.pageSize) : undefined,
        projectName: query.projectName ? String(query.projectName) : undefined,
      });
      return useResponseSuccess(data);
    } catch (error) {
      logApiError(
        'vehicle-commissioning-reports-list',
        error,
        undefined,
        event,
      );
      return internalServerErrorResponse(
        event,
        'Failed to fetch daily reports',
      );
    }
  },
);
