import { ISSUE_TRACKING_STATUS } from '@qgs/shared';
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

const vehicleCommissioningIssuesQuerySchema = z.object({
  date: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  projectName: z.string().optional(),
  status: z
    .enum([
      ISSUE_TRACKING_STATUS.OPEN,
      ISSUE_TRACKING_STATUS.IN_PROGRESS,
      ISSUE_TRACKING_STATUS.RESOLVED,
      ISSUE_TRACKING_STATUS.CLOSED,
    ])
    .optional(),
  workOrderNumber: z.string().optional(),
});

export default defineValidatedHandler(
  vehicleCommissioningIssuesQuerySchema,
  async (event, query) => {
    const userinfo = verifyAccessToken(event);
    if (!userinfo) {
      return unAuthorizedResponse(event);
    }

    try {
      return useResponseSuccess(
        await VehicleCommissioningService.getIssues(query),
      );
    } catch (error) {
      logApiError('vehicle-commissioning-issues-list', error, undefined, event);
      return internalServerErrorResponse(event, 'Failed to fetch issues');
    }
  },
);
