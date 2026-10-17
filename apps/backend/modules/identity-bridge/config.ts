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

export function authenticateClient(
  client: BridgeClient,
  id: string,
  secret: string,
) {
  const same = timingSafeEqual(
    Buffer.from(digest(secret)),
    Buffer.from(digest(client.secret)),
  );
  if (!same || id !== client.id) rejectIdentity();
}
