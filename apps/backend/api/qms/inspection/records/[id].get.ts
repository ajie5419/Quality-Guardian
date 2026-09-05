import { defineEventHandler } from 'h3';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
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
    const userinfo = getCurrentUser(event);
    const result = await InspectionService.findById(id, {
      scope: event.context.dataScope,
      user: userinfo,
    });
    if (!result) {
      return notFoundResponse(event, 'Inspection record not found');
    }
    return useResponseSuccess(result);
  } catch (error: unknown) {
    logApiError('inspection-detail', error, undefined, event);
    return internalServerErrorResponse(
      event,
      'Failed to fetch inspection record detail',
    );
  }
});
