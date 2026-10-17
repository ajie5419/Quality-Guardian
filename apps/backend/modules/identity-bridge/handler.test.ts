import type { H3Event } from 'h3';

import { randomBytes } from 'node:crypto';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sanitizeContext } from '~/utils/logger';

import { authenticateClient, loadBridgeClient } from './config';
import { assertIdentityBridgePermission } from './handler';
import { authorizeSchema, exchangeSchema } from './schema';

vi.mock('~/utils/prisma', () => ({ default: {} }));
vi.mock('h3', async (original) => ({
  ...(await original<typeof import('h3')>()),
  getHeader: (event: { headers: Record<string, string> }, key: string) =>
    event.headers[key],
  getRequestIP: (event: { ip: string }) => event.ip,
}));
const token = () => randomBytes(32).toString('base64url');
let secret: string;
beforeEach(() => {
  secret = token();
  vi.stubEnv('QMS_IDENTITY_CLIENT_ID', 'gc-test');
  vi.stubEnv('QMS_IDENTITY_CLIENT_SECRET', secret);
  vi.stubEnv(
    'QMS_IDENTITY_CALLBACK',
    'https://gc.example.test/api/auth/callback',
  );
});
afterEach(() => vi.unstubAllEnvs());

it('requires complete HTTPS registration and an independently authenticated client', () => {
  const client = loadBridgeClient();
  expect(() => authenticateClient(client, client.id, token())).toThrow();
  expect(() => authenticateClient(client, 'other', secret)).toThrow();
  expect(() => authenticateClient(client, client.id, secret)).not.toThrow();
  for (const callback of [
    'http://localhost/api/auth/callback',
    'https://gc.example.test/api/auth/callback?next=x',
    'https://gc.example.test/api/auth/callback#x',
  ]) {
    vi.stubEnv('QMS_IDENTITY_CALLBACK', callback);
    expect(loadBridgeClient).toThrow();
  }
});

it('rejects unsupported PKCE methods, malformed secrets and extra protocol fields', () => {
  const request = {
    clientId: 'gc-test',
    redirectUri: 'https://gc.example.test/api/auth/callback',
    state: token(),
    challenge: token(),
    method: 'S256',
  };
  expect(authorizeSchema.safeParse(request).success).toBe(true);
  expect(
    authorizeSchema.safeParse({ ...request, method: 'plain' }).success,
  ).toBe(false);
  expect(
    authorizeSchema.safeParse({ ...request, next: 'https://evil.test' })
      .success,
  ).toBe(false);
  expect(
    exchangeSchema.safeParse({
      code: token(),
      verifier: 'short',
      redirectUri: request.redirectUri,
    }).success,
  ).toBe(false);
});

it('keeps signing and exchange quotas separate and never puts identity or revoke in those buckets', async () => {
  const event = {
    context: { userId: 'test-user' },
    ip: token(),
    headers: {
      'x-identity-client-id': 'gc-test',
      'x-identity-client-secret': secret,
    },
  } as unknown as H3Event;
  for (let i = 0; i < 60; i++)
    await assertIdentityBridgePermission(event, 'authorize');
  await expect(
    assertIdentityBridgePermission(event, 'authorize'),
  ).rejects.toMatchObject({ httpStatus: 429 });
  await expect(
    assertIdentityBridgePermission(event, 'exchange'),
  ).resolves.toMatchObject({ id: 'gc-test' });
  for (let i = 0; i < 650; i++)
    await assertIdentityBridgePermission(event, 'identity');
  await expect(
    assertIdentityBridgePermission(event, 'revoke'),
  ).resolves.toMatchObject({ id: 'gc-test' });
});

it('explicitly redacts nested client headers, credential and authorization protocol material', () => {
  const value = token();
  const sanitized = sanitizeContext({
    headers: { 'X-Identity-Client-Secret': value, authorization: value },
    body: {
      code: value,
      verifier: value,
      credential: value,
      state: value,
      challenge: value,
    },
  });
  expect(JSON.stringify(sanitized)).not.toContain(value);
  expect(JSON.stringify(sanitized)).toContain('[REDACTED]');
});
