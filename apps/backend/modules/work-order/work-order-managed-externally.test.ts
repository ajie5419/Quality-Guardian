import { beforeEach, describe, expect, it, vi } from 'vitest';
import batchDeleteRoute from '~/api/qms/work-order/batch-delete.post';
import importRoute from '~/api/qms/work-order/import.post';
import deleteRoute from '~/api/qms/work-order/index.delete';
import createRoute from '~/api/qms/work-order/index.post';
import updateRoute from '~/api/qms/work-order/index.put';
import prisma from '~/utils/prisma';

import { WORK_ORDER_MANAGED_EXTERNALLY_MESSAGE } from './work-order-managed-externally';

vi.mock('~/utils/prisma', () => {
  const table = () => ({
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
  });
  const client = { work_orders: table() };
  return { default: client, prisma: client };
});
vi.mock('h3', async (original) => ({
  ...(await original<typeof import('h3')>()),
  defineEventHandler: (handler: unknown) => handler,
  setResponseStatus: (event: any, status: number) => {
    event.status = status;
  },
}));

describe('qms work-order write endpoints maintained by fulfillment', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['POST /api/qms/work-order', createRoute],
    ['PUT /api/qms/work-order', updateRoute],
    ['POST /api/qms/work-order/import', importRoute],
    ['DELETE /api/qms/work-order', deleteRoute],
    ['POST /api/qms/work-order/batch-delete', batchDeleteRoute],
  ])('%s answers 403 without touching work orders', async (_name, route) => {
    const event = { context: {}, status: 200 } as any;
    const body = await (route as (event: unknown) => unknown)(event);
    expect(event.status).toBe(403);
    expect(body).toEqual({
      code: -1,
      data: null,
      error: { code: 'FORBIDDEN' },
      message: WORK_ORDER_MANAGED_EXTERNALLY_MESSAGE,
    });
    const workOrders = vi.mocked(prisma.work_orders);
    for (const method of Object.values(workOrders)) {
      expect(method).not.toHaveBeenCalled();
    }
  });
});
