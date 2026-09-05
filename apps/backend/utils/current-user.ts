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

/**
 * Builds the uniform AnalyticsAccessContext for Dashboard / Report /
 * Workspace aggregate reads (SEC-ANALYTICS-SCOPE-001). `userId` is
 * mandatory: when authentication is missing, `getCurrentUser` throws and the
 * analytics service fail-closed guard denies the request.
 */
export function getAnalyticsAccessContext(event: H3Event<EventHandlerRequest>) {
  const user = getCurrentUser(event);
  return {
    dataScope: event.context.dataScope,
    user: {
      userId: String(user.id || user.userId || ''),
      username: user.username,
    },
  };
}

export function getOptionalCurrentUser(
  event: H3Event<EventHandlerRequest>,
): null | UserSession {
  return event.context.user || null;
}
