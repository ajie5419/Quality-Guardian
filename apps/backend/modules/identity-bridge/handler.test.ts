import type { H3Event } from 'h3';

import { randomBytes } from 'node:crypto';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sanitizeContext } from '~/utils/logger';

import {
  authenticateClient,
  loadBridgeClient,
  resolveClientName,
} from './config';
import {
  assertIdentityBridgePermission,
  handleIdentityClientLookup,
} from './handler';
import { authorizeSchema, exchangeSchema } from './schema';

vi.mock('~/utils/prisma', () => ({ default: {} }));
vi.mock('h3', async (original) => ({
  ...(await original<typeof import('h3')>()),
  getHeader: (event: { headers: Record<string, string> }, key: string) =>
    event.headers[key],
  getRequestIP: (event: { ip: string }) => event.ip,
  getQuery: (event: { query: Record<string, string> }) => event.query,
  setHeader: () => {},
  setResponseStatus: (event: { status?: number }, status: number) => {
    event.status = status;
  },
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

it('evicts the oldest bucket instead of refusing new sources when the map is full', async () => {
  const eventFor = (ip: string) =>
    ({
      context: { userId: 'test-user' },
      headers: {},
      ip,
    }) as unknown as H3Event;
  const first = eventFor(token());
  for (let i = 0; i < 60; i++)
    await assertIdentityBridgePermission(first, 'authorize');
  await expect(
    assertIdentityBridgePermission(first, 'authorize'),
  ).rejects.toMatchObject({ httpStatus: 429 });
  for (let i = 0; i < 2048; i++)
    await assertIdentityBridgePermission(eventFor(token()), 'authorize');
  // The exhausted bucket was the oldest one, so it has been evicted.
  await expect(
    assertIdentityBridgePermission(first, 'authorize'),
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

it('names only the registered client and exact callback, from configuration only', () => {
  const client = loadBridgeClient();
  expect(resolveClientName(client, client.id, client.callback)).toBe(
    '项目履约系统',
  );
  vi.stubEnv('QMS_IDENTITY_CLIENT_NAME', '  客户履约平台 ');
  expect(resolveClientName(client, client.id, client.callback)).toBe(
    '客户履约平台',
  );
  vi.stubEnv('QMS_IDENTITY_CLIENT_NAME', '');
  expect(resolveClientName(client, client.id, client.callback)).toBe(
    '项目履约系统',
  );
  expect(resolveClientName(client, 'other', client.callback)).toBeNull();
  expect(
    resolveClientName(client, client.id, `${client.callback}?next=x`),
  ).toBeNull();
});

it('answers the public lookup with the name only and a fixed 404 otherwise', () => {
  const lookup = (query: Record<string, string>) => {
    const event = { query } as { query: object; status?: number };
    const body = handleIdentityClientLookup(event as unknown as H3Event) as {
      code: number;
      data: unknown;
    };
    return { ...body, status: event.status ?? 200 };
  };
  const callback = 'https://gc.example.test/api/auth/callback';
  expect(lookup({ clientId: 'gc-test', redirectUri: callback })).toMatchObject({
    code: 0,
    data: { name: '项目履约系统' },
  });
  for (const query of [
    { clientId: 'gc-other', redirectUri: callback },
    { clientId: 'gc-test', redirectUri: 'https://evil.test/cb' },
    { clientId: 'gc-test' },
    {},
  ]) {
    expect(lookup(query)).toMatchObject({ status: 404, data: null });
  }
});
