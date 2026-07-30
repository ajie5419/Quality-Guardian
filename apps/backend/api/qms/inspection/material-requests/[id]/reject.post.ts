import { defineEventHandler, readBody } from 'h3';
import { parseInspectionMaterialRequestRejectInput } from '~/modules/inspection/inspection-material-request.schema';
import { InspectionMaterialRequestService } from '~/modules/inspection/inspection-material-request.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const user = getCurrentUser(event);
  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') return id;
  try {
    const input = parseInspectionMaterialRequestRejectInput(
      await readBody(event),
    );
    return useResponseSuccess(
      await InspectionMaterialRequestService.reject(event, user, id, input),
    );
  } catch (error) {
    logApiError('inspection-material-request-reject', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(
      event,
      'Failed to reject material request',
    );
  }
});
