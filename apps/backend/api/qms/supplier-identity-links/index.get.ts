import { z } from 'zod';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import { logApiError } from '~/utils/api-logger';
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
    return useResponseSuccess(await SupplierIdentityService.list(query));
  } catch (error: unknown) {
    logApiError('supplier-identity', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to list identity links');
  }
});
