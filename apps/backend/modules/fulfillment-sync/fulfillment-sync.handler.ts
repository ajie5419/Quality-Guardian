import type { H3Event } from 'h3';

import type { FulfillmentSyncResource } from './fulfillment-sync.schema';

import { getQuery, setHeader } from 'h3';
import { assertIdentityClientHeaders } from '~/modules/identity-bridge';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

import { fulfillmentSyncQuerySchema } from './fulfillment-sync.schema';
import { FulfillmentSyncService } from './fulfillment-sync.service';

/**
 * Shared GET handler for the fulfillment sync feeds. The path is exempt from
 * JWT in `middleware/3.auth.ts`; the bridge client headers are checked here
 * before any query parsing or database access.
 */
export async function handleFulfillmentSyncRequest(
  event: H3Event,
  resource: FulfillmentSyncResource,
) {
  setHeader(event, 'Cache-Control', 'no-store');
  try {
    assertIdentityClientHeaders(event);
    const parsed = fulfillmentSyncQuerySchema.safeParse(getQuery(event));
    if (!parsed.success) {
      return badRequestResponse(event, 'Invalid sync query');
    }
    return useResponseSuccess(
      await FulfillmentSyncService.list(resource, parsed.data),
    );
  } catch (error) {
    logApiError(`fulfillment-sync-${resource}`, error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, 'Fulfillment sync failed');
  }
}
