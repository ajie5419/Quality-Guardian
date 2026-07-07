import type { EventHandlerRequest, H3Event } from 'h3';

import {
  defineEventHandler,
  getHeader,
  getRequestURL,
  setResponseStatus,
} from 'h3';
import { createModuleLogger } from '~/utils/logger';
import { checkRateLimit } from '~/utils/rate-limit';
import { useResponseError } from '~/utils/response';

const logger = createModuleLogger('PublicRateLimit');

const PUBLIC_PREFIX = '/api/qms/public/';

function resolveClientIp(event: H3Event<EventHandlerRequest>): string {
  const forwardedFor = getHeader(event, 'x-forwarded-for');
  const realIp = getHeader(event, 'x-real-ip');
  const socketIp = event.node.req.socket.remoteAddress;
  return String(forwardedFor || realIp || socketIp || 'unknown')
    .split(',')[0]
    .trim();
}

export default defineEventHandler(async (event) => {
  const pathname = getRequestURL(event).pathname;
  if (!pathname.startsWith(PUBLIC_PREFIX)) return;

  const ip = resolveClientIp(event);
  const key = `rl:pub:${ip}:${pathname}`;

  const allowed = await checkRateLimit(key);
  if (!allowed) {
    logger.warn({ ip, pathname }, 'Public rate limit exceeded');
    setResponseStatus(event, 429);
    return useResponseError('Too Many Requests', 'Rate limit exceeded');
  }
});
