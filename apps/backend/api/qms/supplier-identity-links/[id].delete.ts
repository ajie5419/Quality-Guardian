import { defineEventHandler } from 'h3';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const id = getRequiredRouterParam(
    event,
    'id',
    'Identity link ID is required',
  );
  if (typeof id !== 'string') return id;
  try {
    await SupplierIdentityService.delete(id);
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('supplier-identity', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, 'Failed to delete identity link');
  }
});
