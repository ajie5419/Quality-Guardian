import type { EventHandlerRequest, H3Event } from 'h3';

import { getCurrentUser } from '~/utils/current-user';

export function getMetricGovernanceActor(event: H3Event<EventHandlerRequest>) {
  const user = getCurrentUser(event);
  const userId = String(user.id || user.userId || '');
  if (!userId) {
    throw new Error('AUTH_CONTEXT_MISSING');
  }
  return { userId };
}
