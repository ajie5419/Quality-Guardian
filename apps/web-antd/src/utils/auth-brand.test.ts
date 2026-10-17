import { describe, expect, it } from 'vitest';

import { isAuthBrandRoute, withAuthRedirect } from './auth-brand';

describe('auth brand', () => {
  it('brands only the shared login routes', () => {
    expect(
      isAuthBrandRoute([{ name: 'Authentication' }, { name: 'Login' }]),
    ).toBe(true);
    expect(isAuthBrandRoute([{ name: 'IdentityAuthorize' }])).toBe(true);
    expect(isAuthBrandRoute([{ name: 'Root' }, { name: 'Workspace' }])).toBe(
      false,
    );
    expect(isAuthBrandRoute([{ name: undefined }])).toBe(false);
  });

  it('round-trips the redirect query through the path', () => {
    const redirect = encodeURIComponent(
      '/identity/authorize?clientId=gc&redirectUri=https%3A%2F%2Fgc.test%2Fcb&state=a+b',
    );
    const path = withAuthRedirect('/auth/register', redirect);
    const query = new URL(path, 'https://qms.invalid').search.slice(1);
    expect(path.startsWith('/auth/register?redirect=')).toBe(true);
    expect(decodeURIComponent(query.replace(/^redirect=/, ''))).toBe(redirect);
    expect(withAuthRedirect('/auth/login', undefined)).toBe('/auth/login');
    expect(withAuthRedirect('/auth/login', '')).toBe('/auth/login');
  });
});
