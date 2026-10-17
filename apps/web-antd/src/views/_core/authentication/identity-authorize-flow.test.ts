import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authorizeOnce,
  classifyFailure,
  parseAuthorizeQuery,
  verifiedCallback,
  wantsForcedLogin,
} from './identity-authorize-flow';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('#/api/request', () => ({
  publicRequestClient: { get: vi.fn() },
  requestClient: { post },
}));

const query = {
  clientId: 'gc',
  redirectUri: 'https://gc.test/api/auth/callback',
  state: 'state-1',
  challenge: 'challenge',
  method: 'S256',
};
const request = {
  clientId: 'gc',
  redirectUri: query.redirectUri,
  state: 'state-1',
  challenge: 'challenge',
  method: 'S256' as const,
};

beforeEach(() => post.mockReset());

describe('identity authorize flow', () => {
  it('parses only complete S256 requests', () => {
    expect(parseAuthorizeQuery(query)).toEqual(request);
    expect(parseAuthorizeQuery({ ...query, method: 'plain' })).toBeNull();
    expect(parseAuthorizeQuery({ ...query, state: '' })).toBeNull();
    expect(parseAuthorizeQuery({ ...query, state: ['a', 'b'] })).toBeNull();
  });

  it('detects the forced re-login prompt', () => {
    expect(wantsForcedLogin({ ...query, prompt: 'login' })).toBe(true);
    expect(wantsForcedLogin(query)).toBe(false);
    expect(wantsForcedLogin({ ...query, prompt: 'none' })).toBe(false);
  });

  it('follows only the registered callback carrying our state and a code', () => {
    const ok = `${query.redirectUri}?code=abc&state=state-1`;
    expect(verifiedCallback(ok, request)).toBe(ok);
    for (const callback of [
      'https://evil.test/api/auth/callback?code=abc&state=state-1',
      `${query.redirectUri}/x?code=abc&state=state-1`,
      `${query.redirectUri}?code=abc&state=other`,
      `${query.redirectUri}?state=state-1`,
      `${query.redirectUri}?code=abc&state=state-1#frag`,
      'https://user:pw@gc.test/api/auth/callback?code=abc&state=state-1',
      'http://gc.test/api/auth/callback?code=abc&state=state-1',
      'not a url',
    ]) {
      expect(verifiedCallback(callback, request)).toBeNull();
    }
  });

  it('posts each request once per page load unless retried', async () => {
    post.mockResolvedValue({ callback: 'x' });
    const once = { ...request, state: 'state-once' };
    await Promise.all([authorizeOnce(once), authorizeOnce(once)]);
    await authorizeOnce(once);
    expect(post).toHaveBeenCalledTimes(1);
    await authorizeOnce(once, true);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('tells a missing client, a rejection and a transport failure apart', () => {
    const body = (code: string) => ({
      code: -1,
      data: null,
      error: { code },
      message: 'x',
    });
    expect(classifyFailure(body('NOT_FOUND'))).toBe('not-found');
    expect(classifyFailure(body('UNAUTHORIZED'))).toBe('rejected');
    expect(classifyFailure({ response: { status: 404 } })).toBe('not-found');
    expect(classifyFailure({ response: { status: 503 } })).toBe('rejected');
    expect(classifyFailure(new Error('Network Error'))).toBe('network');
    expect(classifyFailure(undefined)).toBe('network');
  });
});
