import { defineEventHandler, getQuery } from 'h3';
import { parseInspectionMaterialRequestListQuery } from '~/modules/inspection/inspection-material-request.schema';
import { InspectionMaterialRequestService } from '~/modules/inspection/inspection-material-request.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const user = getCurrentUser(event);
  try {
    const query = parseInspectionMaterialRequestListQuery(getQuery(event));
    return useResponseSuccess(
      await InspectionMaterialRequestService.list(user, query),
    );
  } catch (error) {
    logApiError('inspection-material-request-list', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(
      event,
      'Failed to list material requests',
    );
  }
});
