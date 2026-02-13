import type { EventHandlerRequest, H3Event } from 'h3';

import { getQuery, setResponseStatus } from 'h3';
import { useResponseError } from '~/utils/response';

export function getRequiredQueryParam(
  event: H3Event<EventHandlerRequest>,
  paramName: string,
  errorMessage: string,
): ReturnType<typeof useResponseError> | string {
  const query = getQuery(event);
  const rawValue = query[paramName];
  const value =
    rawValue === undefined || rawValue === null ? '' : String(rawValue);

  if (!value) {
    setResponseStatus(event, 400);
    return useResponseError(errorMessage);
  }

  return value;
}
