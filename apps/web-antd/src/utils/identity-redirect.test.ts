import { describe, expect, it } from 'vitest';

import { identityRedirect, identityRedirectTarget } from './identity-redirect';

const authorize =
  '/identity/authorize?clientId=gc&redirectUri=https%3A%2F%2Fgc.test%2Fcb&state=s&challenge=c&method=S256';

describe('identity redirect', () => {
  it('accepts only the fixed authorize page', () => {
    expect(identityRedirect(encodeURIComponent(authorize))).toBe(authorize);
    for (const value of [
      encodeURIComponent('https://evil.test/identity/authorize?clientId=gc'),
      encodeURIComponent('//evil.test/identity/authorize'),
      encodeURIComponent('/workspace'),
      encodeURIComponent(`${authorize}#x`),
      undefined,
    ]) {
      expect(identityRedirect(value)).toBeNull();
    }
  });

  it('drops the forced-login prompt so the return trip cannot loop', () => {
    expect(
      identityRedirect(encodeURIComponent(`${authorize}&prompt=login`)),
    ).toBe(authorize);
  });

  it('exposes only the client id and callback for the name lookup', () => {
    expect(identityRedirectTarget(encodeURIComponent(authorize))).toEqual({
      clientId: 'gc',
      redirectUri: 'https://gc.test/cb',
    });
    expect(
      identityRedirectTarget(
        encodeURIComponent('/identity/authorize?clientId=gc'),
      ),
    ).toBeNull();
    expect(
      identityRedirectTarget(encodeURIComponent('/auth/login')),
    ).toBeNull();
  });
});
