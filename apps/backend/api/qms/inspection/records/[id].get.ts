import { defineEventHandler } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const result = await InspectionService.findById(id);
    if (!result) {
      return notFoundResponse(event, 'Inspection record not found');
    }
    return useResponseSuccess(result);
  } catch (error: unknown) {
    logApiError('inspection-detail', error);
    return internalServerErrorResponse(
      event,
      'Failed to fetch inspection record detail',
    );
  }
});
