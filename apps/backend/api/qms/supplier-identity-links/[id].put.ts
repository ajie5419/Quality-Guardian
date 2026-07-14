import {
  supplierIdentityInputSchema,
  SupplierIdentityService,
} from '~/modules/supplier-identity';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineValidatedHandler(
  supplierIdentityInputSchema,
  async (event, body) => {
    const id = getRequiredRouterParam(
      event,
      'id',
      'Identity link ID is required',
    );
    if (typeof id !== 'string') return id;
    try {
      return useResponseSuccess(await SupplierIdentityService.update(id, body));
    } catch (error: unknown) {
      logApiError('supplier-identity', error, undefined, event);
      if (isBusinessError(error)) return businessErrorResponse(event, error);
      return internalServerErrorResponse(
        event,
        'Failed to update identity link',
      );
    }
  },
);
