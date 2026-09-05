import type { EventHandlerRequest, H3Event } from 'h3';

import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import {
  badRequestResponse,
  internalServerErrorResponse,
} from '~/utils/response';

// Shared catch handler for the borrow-domain routes: maps CAS conflicts
// (BusinessError 409/404) to their HTTP status and legacy Error throws to 400.
export function handleBorrowRouteError(
  event: H3Event<EventHandlerRequest>,
  error: unknown,
  fallbackMessage: string,
) {
  if (isBusinessError(error)) {
    return businessErrorResponse(event, error);
  }
  if (error instanceof Error) {
    return badRequestResponse(event, error.message);
  }
  return internalServerErrorResponse(event, fallbackMessage);
}
