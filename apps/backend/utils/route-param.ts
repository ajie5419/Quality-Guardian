import type { EventHandlerRequest, H3Event } from 'h3';

import { getRouterParam, setResponseStatus } from 'h3';
import { useResponseError } from '~/utils/response';

export function getRequiredRouterParam(
  event: H3Event<EventHandlerRequest>,
  paramName: string,
  errorMessage: string,
): ReturnType<typeof useResponseError> | string {
  const value = getRouterParam(event, paramName);
  if (!value) {
    setResponseStatus(event, 400);
    return useResponseError(errorMessage);
  }

  return value;
}
