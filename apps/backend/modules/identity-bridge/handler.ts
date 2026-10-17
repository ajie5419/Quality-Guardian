import type { H3Event } from 'h3';

import type { BridgeClient } from './config';

import { ErrorCode } from '@qgs/shared';
import { getHeader, getQuery, getRequestIP, readBody, setHeader } from 'h3';
import {
  BusinessError,
  businessErrorResponse,
  isBusinessError,
} from '~/utils/business-error';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { useResponseSuccess } from '~/utils/response';

import {
  authenticateClient,
  digest,
  loadBridgeClient,
  loadClientCredentials,
  rejectIdentity,
  resolveClientName,
} from './config';
import { createIdentityBridge } from './identity-bridge.service';
import { authorizeSchema, clientLookupSchema, exchangeSchema } from './schema';

const logger = createModuleLogger('identity-bridge');
// Burst protection is process-local only; correctness and redemption always depend on MySQL.
const MAX_BUCKETS = 2048;
const MAX_REQUESTS_PER_WINDOW = 60;
const buckets = new Map<string, { count: number; start: number }>();
function limitRequests(event: H3Event, action: string, clientId: string) {
  if (action !== 'authorize' && action !== 'exchange') return;
  const now = Date.now();
  for (const [key, value] of buckets)
    if (now - value.start >= 60_000) buckets.delete(key);
  const key = digest(
    `${action}:${clientId.slice(0, 128)}:${getRequestIP(event) || 'unknown'}`,
  );
  let bucket = buckets.get(key);
  if (!bucket) {
    // A full map evicts its oldest bucket (Map keeps insertion order) so new
    // sources are never refused just because many others were seen recently.
    if (buckets.size >= MAX_BUCKETS) {
      const oldest = buckets.keys().next();
      if (!oldest.done) buckets.delete(oldest.value);
    }
    bucket = { count: 0, start: now };
    buckets.set(key, bucket);
  }
  if (++bucket.count > MAX_REQUESTS_PER_WINDOW) {
    throw new BusinessError(
      ErrorCode.FORBIDDEN,
      'Too many identity requests',
      429,
    );
  }
}

export async function assertIdentityBridgePermission(
  event: H3Event,
  action: string,
): Promise<BridgeClient> {
  const client = loadBridgeClient();
  limitRequests(event, action, client.id);
  if (action === 'authorize') {
    if (!event.context.userId) rejectIdentity();
  } else {
    authenticateClient(
      client,
      getHeader(event, 'x-identity-client-id') || '',
      getHeader(event, 'x-identity-client-secret') || '',
    );
  }
  return client;
}

/**
 * Authenticates a machine request by the bridge client headers. Throws 503
 * when the credentials are not configured and 401 when they do not match.
 */
export function assertIdentityClientHeaders(event: H3Event) {
  const client = loadClientCredentials();
  if (!client) {
    throw new BusinessError(
      ErrorCode.INTERNAL,
      'Identity client is not configured',
      503,
    );
  }
  authenticateClient(
    client,
    getHeader(event, 'x-identity-client-id') || '',
    getHeader(event, 'x-identity-client-secret') || '',
  );
}

export async function handleIdentityBridge(
  event: H3Event,
  action: 'authorize' | 'exchange' | 'identity' | 'revoke',
  authorization: Promise<BridgeClient>,
) {
  setHeader(event, 'Cache-Control', 'no-store');
  setHeader(event, 'Referrer-Policy', 'no-referrer');
  try {
    const client = await authorization;
    const bridge = createIdentityBridge(prisma, client);
    if (action === 'authorize') {
      if (!event.context.userId) rejectIdentity();
      const input = authorizeSchema.safeParse(await readBody(event));
      if (!input.success)
        throw new BusinessError(
          ErrorCode.VALIDATION,
          'Invalid identity request',
        );
      return useResponseSuccess(
        await bridge.authorize(String(event.context.userId), input.data),
      );
    }
    if (action === 'exchange') {
      const input = exchangeSchema.safeParse(await readBody(event));
      if (!input.success)
        throw new BusinessError(
          ErrorCode.VALIDATION,
          'Invalid identity request',
        );
      return useResponseSuccess(await bridge.exchange(input.data));
    }
    const credential = getHeader(event, 'authorization')?.match(
      /^Bearer ([\w-]{43})$/,
    )?.[1];
    if (!credential) rejectIdentity();
    return useResponseSuccess(await bridge[action](credential));
  } catch (error) {
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    logger.error('Identity bridge unavailable');
    return businessErrorResponse(
      event,
      new BusinessError(
        ErrorCode.INTERNAL,
        'Identity service unavailable',
        503,
      ),
    );
  }
}

/**
 * Public read-only lookup used by the login and authorize pages to label the
 * target system. Answers only for the registered client id + exact callback;
 * anything else is a fixed 404 so the page falls back to a neutral label.
 */
export function handleIdentityClientLookup(event: H3Event) {
  setHeader(event, 'Cache-Control', 'no-store');
  setHeader(event, 'Referrer-Policy', 'no-referrer');
  try {
    const input = clientLookupSchema.safeParse(getQuery(event));
    const name = input.success
      ? resolveClientName(
          loadBridgeClient(),
          input.data.clientId,
          input.data.redirectUri,
        )
      : null;
    if (!name)
      throw new BusinessError(
        ErrorCode.NOT_FOUND,
        'Identity client not found',
        404,
      );
    return useResponseSuccess({ name });
  } catch (error) {
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    logger.error('Identity bridge unavailable');
    return businessErrorResponse(
      event,
      new BusinessError(
        ErrorCode.INTERNAL,
        'Identity service unavailable',
        503,
      ),
    );
  }
}
