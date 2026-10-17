import { Buffer } from 'node:buffer';
import { createHash, timingSafeEqual } from 'node:crypto';
import process from 'node:process';

import { ErrorCode } from '@qgs/shared';
import { z } from 'zod';
import { BusinessError } from '~/utils/business-error';

export interface BridgeClient {
  id: string;
  secret: string;
  callback: string;
}

export function loadBridgeClient(): BridgeClient {
  const value = z
    .object({
      id: z.string().min(1).max(128),
      secret: z.string().min(32).max(256),
      callback: z.string().url().max(512),
    })
    .parse({
      id: process.env.QMS_IDENTITY_CLIENT_ID,
      secret: process.env.QMS_IDENTITY_CLIENT_SECRET,
      callback: process.env.QMS_IDENTITY_CALLBACK,
    });
  const url = new URL(value.callback);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  ) {
    throw new Error('IDENTITY_CONFIGURATION_INVALID');
  }
  return { id: value.id, secret: value.secret, callback: value.callback };
}

export function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function rejectIdentity(): never {
  throw new BusinessError(
    ErrorCode.UNAUTHORIZED,
    'Identity authorization is invalid or expired',
    401,
  );
}

function sameDigest(left: string, right: string) {
  return timingSafeEqual(Buffer.from(digest(left)), Buffer.from(digest(right)));
}

const DEFAULT_CLIENT_NAME = '项目履约系统';

/**
 * Returns the operator-configured display name of the registered client, but
 * only when both the client id and the exact callback match the registration.
 * The name never comes from the caller, so a crafted link cannot relabel the
 * login page. Returns null on any mismatch.
 */
export function resolveClientName(
  client: Pick<BridgeClient, 'callback' | 'id'>,
  clientId: string,
  redirectUri: string,
): null | string {
  const sameId = sameDigest(clientId, client.id);
  const sameCallback = sameDigest(redirectUri, client.callback);
  if (!sameId || !sameCallback) return null;
  const name = z
    .string()
    .trim()
    .min(1)
    .max(64)
    .safeParse(process.env.QMS_IDENTITY_CLIENT_NAME);
  return name.success ? name.data : DEFAULT_CLIENT_NAME;
}

export function authenticateClient(
  client: Pick<BridgeClient, 'id' | 'secret'>,
  id: string,
  secret: string,
) {
  // Both comparisons always run so timing reveals neither which part failed.
  const sameSecret = sameDigest(secret, client.secret);
  const sameId = sameDigest(id, client.id);
  if (!sameSecret || !sameId) rejectIdentity();
}

/**
 * Loads only the confidential client id/secret (no callback), for machine
 * endpoints that reuse the bridge credentials. Returns null when absent or
 * invalid so callers fail closed instead of admitting anonymous traffic.
 */
export function loadClientCredentials(): null | Pick<
  BridgeClient,
  'id' | 'secret'
> {
  const value = z
    .object({
      id: z.string().min(1).max(128),
      secret: z.string().min(32).max(256),
    })
    .safeParse({
      id: process.env.QMS_IDENTITY_CLIENT_ID,
      secret: process.env.QMS_IDENTITY_CLIENT_SECRET,
    });
  if (!value.success) return null;
  return { id: value.data.id, secret: value.data.secret };
}
