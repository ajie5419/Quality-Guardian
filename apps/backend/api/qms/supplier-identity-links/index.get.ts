import { z } from 'zod';
import {
  SupplierIdentityAccessService,
  SupplierIdentityService,
} from '~/modules/supplier-identity';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const querySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export default defineValidatedHandler(querySchema, async (event, query) => {
  try {
    SupplierIdentityAccessService.ensureAdmin(getCurrentUser(event));
    return useResponseSuccess(await SupplierIdentityService.list(query));
  } catch (error: unknown) {
    logApiError('supplier-identity', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, 'Failed to list identity links');
  }
});
