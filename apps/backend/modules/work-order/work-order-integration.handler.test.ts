import { randomBytes } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessError } from '~/utils/business-error';

import {
  assertFulfillmentWorkOrderPermission,
  handleFulfillmentWorkOrderWrite as handleWrite,
} from './work-order-integration.handler';
import { WorkOrderIntegrationService } from './work-order-integration.service';

vi.mock('~/utils/prisma', () => ({ default: {} }));
vi.mock('~/utils/api-logger', () => ({ logApiError: vi.fn() }));
vi.mock('./work-order-integration.service', () => ({
  WorkOrderIntegrationService: {
    cancel: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock('h3', async (original) => ({
  ...(await original<typeof import('h3')>()),
  getHeader: (event: any, key: string) => event.headers[key],
  getRouterParam: (event: any, name: string) => event.params?.[name],
  readBody: vi.fn(async (event: any) => {
    if (event.rawBody === 'invalid-json') throw new Error('Invalid JSON');
    return event.body;
  }),
  setHeader: vi.fn(),
  setResponseStatus: (event: any, status: number) => {
    event.status = status;
  },
}));

const service = vi.mocked(WorkOrderIntegrationService);
const handleFulfillmentWorkOrderWrite = (
  event: any,
  action: 'cancel' | 'create' | 'update',
) => handleWrite(event, action, assertFulfillmentWorkOrderPermission);
let secret: string;

function makeEvent(
  body: unknown,
  options: {
    headers?: Record<string, string>;
    params?: Record<string, string>;
    rawBody?: string;
  } = {},
) {
  return {
    body,
    headers: options.headers ?? {
      'x-identity-client-id': 'gc-test',
      'x-identity-client-secret': secret,
    },
    params: options.params ?? {},
    rawBody: options.rawBody,
    status: 200,
  } as any;
}

const validCreate = {
  actorUserId: 'user-7',
  customerNameId: 'cust-1',
  deliveryDate: '2026-12-01',
  quantity: 2,
  workOrderNumber: ' WO-1 ',
};

describe('handleFulfillmentWorkOrderWrite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    secret = randomBytes(32).toString('base64url');
    vi.stubEnv('QMS_IDENTITY_CLIENT_ID', 'gc-test');
    vi.stubEnv('QMS_IDENTITY_CLIENT_SECRET', secret);
    service.create.mockResolvedValue({ workOrderNumber: 'WO-1' } as any);
    service.update.mockResolvedValue({ workOrderNumber: 'WO-1' } as any);
    service.cancel.mockResolvedValue({ status: 'CANCELLED' } as any);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns 401 for missing or wrong client headers before any write', async () => {
    for (const headers of [
      {},
      { 'x-identity-client-id': 'gc-test', 'x-identity-client-secret': 'x' },
      { 'x-identity-client-id': 'other', 'x-identity-client-secret': secret },
    ]) {
      for (const action of ['create', 'update', 'cancel'] as const) {
        const event = makeEvent(validCreate, {
          headers,
          params: { workOrderNumber: 'WO-1' },
        });
        const body = await handleFulfillmentWorkOrderWrite(event, action);
        expect(event.status).toBe(401);
        expect(body.code).toBe(-1);
      }
    }
    expect(service.create).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
    expect(service.cancel).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when client credentials are not configured', async () => {
    vi.stubEnv('QMS_IDENTITY_CLIENT_SECRET', '');
    const event = makeEvent(validCreate);
    await handleFulfillmentWorkOrderWrite(event, 'create');
    expect(event.status).toBe(503);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('creates with the parsed body and returns code 0', async () => {
    const event = makeEvent(validCreate);
    const body = await handleFulfillmentWorkOrderWrite(event, 'create');
    expect(event.status).toBe(200);
    expect(body).toEqual({
      code: 0,
      data: { workOrderNumber: 'WO-1' },
      error: null,
      message: 'ok',
    });
    expect(service.create).toHaveBeenCalledWith(event, {
      ...validCreate,
      workOrderNumber: 'WO-1',
    });
  });

  it.each([
    [{ ...validCreate, quantity: 0 }, '数量'],
    [{ ...validCreate, quantity: 1.5 }, '数量'],
    [{ ...validCreate, deliveryDate: '2026-02-30' }, '交付日期'],
    [{ ...validCreate, deliveryDate: '2026-12-01T00:00:00Z' }, '交付日期'],
    [{ ...validCreate, workOrderNumber: '   ' }, '工单号'],
    [{ ...validCreate, workOrderNumber: 'W'.repeat(65) }, '工单号'],
    [{ ...validCreate, actorUserId: undefined }, '操作人'],
    [{ ...validCreate, customerNameId: '' }, '客户'],
  ])(
    'rejects invalid create input with a Chinese 400 message',
    async (input, label) => {
      const event = makeEvent(input);
      const body = await handleFulfillmentWorkOrderWrite(event, 'create');
      expect(event.status).toBe(400);
      expect(body.message).toBe(`参数错误：${label}`);
      expect(service.create).not.toHaveBeenCalled();
    },
  );

  it('rejects a malformed or missing body with 400', async () => {
    const malformed = makeEvent(undefined, { rawBody: 'invalid-json' });
    await handleFulfillmentWorkOrderWrite(malformed, 'create');
    expect(malformed.status).toBe(400);
    const empty = makeEvent(undefined);
    await handleFulfillmentWorkOrderWrite(empty, 'create');
    expect(empty.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('requires a version and only open/in-progress/completed status on update', async () => {
    const params = { workOrderNumber: 'WO-1' };
    for (const input of [
      { actorUserId: 'user-7' },
      { actorUserId: 'user-7', version: '2' },
      { actorUserId: 'user-7', status: 'CANCELLED', version: 2 },
    ]) {
      const event = makeEvent(input, { params });
      await handleFulfillmentWorkOrderWrite(event, 'update');
      expect(event.status).toBe(400);
    }
    expect(service.update).not.toHaveBeenCalled();

    const ok = makeEvent(
      { actorUserId: 'user-7', status: 'COMPLETED', version: 2 },
      { params },
    );
    await handleFulfillmentWorkOrderWrite(ok, 'update');
    expect(ok.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith(ok, 'WO-1', {
      actorUserId: 'user-7',
      status: 'COMPLETED',
      version: 2,
    });
  });

  it('rejects a missing work order number path parameter with 400', async () => {
    const event = makeEvent({ actorUserId: 'user-7', version: 1 });
    await handleFulfillmentWorkOrderWrite(event, 'cancel');
    expect(event.status).toBe(400);
    expect(service.cancel).not.toHaveBeenCalled();
  });

  it('forwards duplicate and version conflicts as 409 with their codes', async () => {
    service.create.mockRejectedValueOnce(
      new BusinessError('WORK_ORDER_EXISTS', '工单号 WO-1 已存在且未删除', 409),
    );
    const duplicate = makeEvent(validCreate);
    const duplicateBody = await handleFulfillmentWorkOrderWrite(
      duplicate,
      'create',
    );
    expect(duplicate.status).toBe(409);
    expect(duplicateBody).toMatchObject({
      error: { code: 'WORK_ORDER_EXISTS' },
      message: '工单号 WO-1 已存在且未删除',
    });

    service.cancel.mockRejectedValueOnce(
      new BusinessError(
        'OPTIMISTIC_LOCK_CONFLICT',
        '记录已被其他用户修改，请刷新后重试',
        409,
      ),
    );
    const stale = makeEvent(
      { actorUserId: 'user-7', version: 1 },
      { params: { workOrderNumber: 'WO-1' } },
    );
    const staleBody = await handleFulfillmentWorkOrderWrite(stale, 'cancel');
    expect(stale.status).toBe(409);
    expect(staleBody.error).toEqual({ code: 'OPTIMISTIC_LOCK_CONFLICT' });
  });

  it('hides unexpected failures behind a generic 500', async () => {
    service.create.mockRejectedValueOnce(new Error('db exploded'));
    const event = makeEvent(validCreate);
    const body = await handleFulfillmentWorkOrderWrite(event, 'create');
    expect(event.status).toBe(500);
    expect(body.message).not.toContain('db exploded');
  });
});
