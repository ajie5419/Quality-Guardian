import type { LocationQuery } from 'vue-router';

import type { IdentityAuthorization } from '#/api/core/identity-bridge';

import { ErrorCode } from '@qgs/shared';

import { authorizeIdentity } from '#/api/core/identity-bridge';
import { IDENTITY_PROMPT_KEY } from '#/utils/identity-redirect';

const KEYS = ['clientId', 'redirectUri', 'state', 'challenge'] as const;

/** Strict shape check; the backend still validates client, callback and PKCE. */
export function parseAuthorizeQuery(
  query: LocationQuery,
): IdentityAuthorization | null {
  if (query.method !== 'S256') return null;
  const values: Partial<Record<(typeof KEYS)[number], string>> = {};
  for (const key of KEYS) {
    const value = query[key];
    if (typeof value !== 'string' || !value) return null;
    values[key] = value;
  }
  const { challenge, clientId, redirectUri, state } = values;
  if (!challenge || !clientId || !redirectUri || !state) return null;
  return { challenge, clientId, method: 'S256', redirectUri, state };
}

export function wantsForcedLogin(query: LocationQuery) {
  return query[IDENTITY_PROMPT_KEY] === 'login';
}

/**
 * Accepts only the backend callback for the exact registered redirect URI and
 * the state this page sent, so the page can never become an open redirect.
 */
export function verifiedCallback(
  callback: string,
  request: IdentityAuthorization,
): null | string {
  try {
    const target = new URL(callback);
    const expected = new URL(request.redirectUri);
    if (
      target.protocol !== 'https:' ||
      target.origin !== expected.origin ||
      target.pathname !== expected.pathname ||
      target.username ||
      target.password ||
      target.hash ||
      target.searchParams.get('state') !== request.state ||
      !target.searchParams.get('code')
    )
      return null;
    return target.href;
  } catch {
    return null;
  }
}

// Module scope survives component remounts within one page load, so the same
// request (keyed by state) is posted at most once unless the user retries.
const pending = new Map<string, Promise<{ callback: string }>>();

export function authorizeOnce(request: IdentityAuthorization, retry = false) {
  if (retry) pending.delete(request.state);
  let call = pending.get(request.state);
  if (!call) {
    call = authorizeIdentity(request);
    pending.set(request.state, call);
  }
  return call;
}

export type FailureKind = 'network' | 'not-found' | 'rejected';

/**
 * The request client throws the response body for HTTP errors and the raw
 * transport error when no response arrived.
 */
export function classifyFailure(error: unknown): FailureKind {
  if (typeof error !== 'object' || error === null) return 'network';
  const value = error as {
    error?: null | { code?: unknown };
    response?: { status?: unknown };
  };
  if (typeof value.response?.status === 'number')
    return value.response.status === 404 ? 'not-found' : 'rejected';
  if ('code' in value && 'message' in value && !(error instanceof Error))
    return value.error?.code === ErrorCode.NOT_FOUND ? 'not-found' : 'rejected';
  return 'network';
}
