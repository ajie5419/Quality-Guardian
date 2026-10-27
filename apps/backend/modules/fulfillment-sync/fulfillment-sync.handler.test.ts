import { randomBytes } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  handleFulfillmentBomRequest,
  handleFulfillmentCustomersRequest,
  handleFulfillmentSyncRequest,
} from './fulfillment-sync.handler';
import { FulfillmentSyncService } from './fulfillment-sync.service';

vi.mock('~/utils/prisma', () => ({ default: {} }));
vi.mock('~/utils/api-logger', () => ({ logApiError: vi.fn() }));
vi.mock('./fulfillment-sync.service', () => ({
  FulfillmentSyncService: {
    list: vi.fn(),
    listCustomers: vi.fn(),
    listWorkOrderBom: vi.fn(),
  },
}));
vi.mock('h3', async (original) => ({
  ...(await original<typeof import('h3')>()),
  getHeader: (event: any, key: string) => event.headers[key],
  getQuery: (event: any) => event.query,
  getRouterParam: (event: any, name: string) => event.params?.[name],
  setHeader: vi.fn(),
  setResponseStatus: (event: any, status: number) => {
    event.status = status;
  },
}));

let secret: string;
const makeEvent = (
  headers: Record<string, string>,
  query: Record<string, unknown> = {},
) => ({ headers, query, status: 200 }) as any;

describe('handleFulfillmentSyncRequest authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    secret = randomBytes(32).toString('base64url');
    vi.stubEnv('QMS_IDENTITY_CLIENT_ID', 'gc-test');
    vi.stubEnv('QMS_IDENTITY_CLIENT_SECRET', secret);
    vi.mocked(FulfillmentSyncService.list).mockResolvedValue({
      items: [],
      nextCursor: null,
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns 401 without client headers and never reads data', async () => {
    const event = makeEvent({});
    const body = await handleFulfillmentSyncRequest(event, 'users');
    expect(event.status).toBe(401);
    expect(body.code).toBe(-1);
    expect(FulfillmentSyncService.list).not.toHaveBeenCalled();
  });

  it('returns 401 for a wrong secret or a wrong client id', async () => {
    for (const headers of [
      { 'x-identity-client-id': 'gc-test', 'x-identity-client-secret': 'x' },
      { 'x-identity-client-id': 'other', 'x-identity-client-secret': secret },
    ]) {
      const event = makeEvent(headers);
      await handleFulfillmentSyncRequest(event, 'users');
      expect(event.status).toBe(401);
    }
    expect(FulfillmentSyncService.list).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the client credentials are not configured', async () => {
    vi.stubEnv('QMS_IDENTITY_CLIENT_SECRET', '');
    const event = makeEvent({
      'x-identity-client-id': 'gc-test',
      'x-identity-client-secret': '',
    });
    await handleFulfillmentSyncRequest(event, 'users');
    expect(event.status).toBe(503);
    expect(FulfillmentSyncService.list).not.toHaveBeenCalled();
  });

  it('serves the feed for the configured client and validates the query', async () => {
    const headers = {
      'x-identity-client-id': 'gc-test',
      'x-identity-client-secret': secret,
    };
    const ok = makeEvent(headers, { limit: '5' });
    const body = await handleFulfillmentSyncRequest(ok, 'inspections');
    expect(ok.status).toBe(200);
    expect(body).toMatchObject({ code: 0, data: { nextCursor: null } });
    expect(FulfillmentSyncService.list).toHaveBeenCalledWith('inspections', {
      limit: 5,
    });
    const bad = makeEvent(headers, { limit: '500' });
    await handleFulfillmentSyncRequest(bad, 'inspections');
    expect(bad.status).toBe(400);
  });
});

describe('handleFulfillmentBomRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    secret = randomBytes(32).toString('base64url');
    vi.stubEnv('QMS_IDENTITY_CLIENT_ID', 'gc-test');
    vi.stubEnv('QMS_IDENTITY_CLIENT_SECRET', secret);
    vi.mocked(FulfillmentSyncService.listWorkOrderBom).mockResolvedValue({
      items: [],
      workOrderNumber: 'WO-1',
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  const bomEvent = (headers: Record<string, string>, wo?: string) => ({
    ...makeEvent(headers),
    params: wo === undefined ? {} : { workOrderNumber: wo },
  });

  it('rejects missing or wrong client headers before reading data', async () => {
    for (const headers of [
      {},
      { 'x-identity-client-id': 'gc-test', 'x-identity-client-secret': 'x' },
    ]) {
      const event = bomEvent(headers, 'WO-1');
      await handleFulfillmentBomRequest(event);
      expect(event.status).toBe(401);
    }
    expect(FulfillmentSyncService.listWorkOrderBom).not.toHaveBeenCalled();
  });

  it('serves the BOM for the configured client and validates the work order', async () => {
    const headers = {
      'x-identity-client-id': 'gc-test',
      'x-identity-client-secret': secret,
    };
    const ok = bomEvent(headers, ' WO-1 ');
    const body = await handleFulfillmentBomRequest(ok);
    expect(ok.status).toBe(200);
    expect(body).toMatchObject({ code: 0, data: { items: [] } });
    expect(FulfillmentSyncService.listWorkOrderBom).toHaveBeenCalledWith(
      'WO-1',
    );
    const bad = bomEvent(headers, '');
    await handleFulfillmentBomRequest(bad);
    expect(bad.status).toBe(400);
  });
});

describe('handleFulfillmentCustomersRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    secret = randomBytes(32).toString('base64url');
    vi.stubEnv('QMS_IDENTITY_CLIENT_ID', 'gc-test');
    vi.stubEnv('QMS_IDENTITY_CLIENT_SECRET', secret);
    vi.mocked(FulfillmentSyncService.listCustomers).mockResolvedValue([
      { id: 'c1', name: 'A' },
    ]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('rejects wrong client headers before reading customers', async () => {
    const event = makeEvent({
      'x-identity-client-id': 'gc-test',
      'x-identity-client-secret': 'x',
    });
    await handleFulfillmentCustomersRequest(event);
    expect(event.status).toBe(401);
    expect(FulfillmentSyncService.listCustomers).not.toHaveBeenCalled();
  });

  it('serves the customer list for the configured client', async () => {
    const event = makeEvent({
      'x-identity-client-id': 'gc-test',
      'x-identity-client-secret': secret,
    });
    const body = await handleFulfillmentCustomersRequest(event);
    expect(event.status).toBe(200);
    expect(body).toMatchObject({ code: 0, data: [{ id: 'c1', name: 'A' }] });
  });
});
