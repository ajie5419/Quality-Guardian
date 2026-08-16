import { defineEventHandler } from 'h3';
import {
  SupplierIdentityAccessService,
  SupplierIdentityService,
} from '~/modules/supplier-identity';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const adminCheck = requireSystemAdmin(event, getCurrentUser(event));
  if (adminCheck) return adminCheck;
  try {
    SupplierIdentityAccessService.ensureAdmin(getCurrentUser(event));
    const id = getRequiredRouterParam(
      event,
      'id',
      'Identity link ID is required',
    );
    if (typeof id !== 'string') return id;
    await SupplierIdentityService.delete(id);
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('supplier-identity', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, 'Failed to delete identity link');
  }
});
