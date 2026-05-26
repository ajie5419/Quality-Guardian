import type { EventHandlerRequest, H3Event } from 'h3';

import type { UserSession } from './jwt-utils';

export function getCurrentUser(
  event: H3Event<EventHandlerRequest>,
): UserSession {
  const user = event.context.user;
  if (!user) {
    throw new Error('AUTH_CONTEXT_MISSING');
  }
  return user;
}

export function getOptionalCurrentUser(
  event: H3Event<EventHandlerRequest>,
): null | UserSession {
  return event.context.user || null;
}
