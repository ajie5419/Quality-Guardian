import { defineEventHandler, getRouterParam } from 'h3';
import { z } from 'zod';
import { WorkOrderRouteService } from '~/modules/work-order/work-order-route.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const requirementIdSchema = z.string().trim().min(1);

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);
  const idResult = requirementIdSchema.safeParse(getRouterParam(event, 'id'));
  if (!idResult.success) {
    return badRequestResponse(event, 'Requirement ID is required');
  }

  try {
    await WorkOrderRouteService.deleteRequirement(
      event,
      idResult.data,
      userinfo,
    );
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('work-order-requirement-delete', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, 'Failed to delete requirement');
  }
});
