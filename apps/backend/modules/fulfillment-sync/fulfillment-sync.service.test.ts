import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { fulfillmentSyncQuerySchema } from './fulfillment-sync.schema';
import { FulfillmentSyncService } from './fulfillment-sync.service';

vi.mock('~/utils/prisma', () => {
  const table = () => ({ findMany: vi.fn() });
  const client = {
    departments: table(),
    dictionaries: table(),
    processes: table(),
    project_boms: table(),
    qms_inspection_requests: table(),
    suppliers: table(),
    users: table(),
    work_orders: table(),
  };
  return { default: client, prisma: client };
});
// The inspection index has a pre-existing import cycle through quality-loss
// when it is the first module evaluated; it is unrelated to these feeds.
vi.mock('~/modules/quality-loss', () => ({}));
vi.mock('~/utils/redis', () => ({
  redis: { del: vi.fn(), get: vi.fn(), set: vi.fn() },
}));

const db = prisma as any;
const T1 = new Date('2026-10-01T08:00:00.123Z');
const T2 = new Date('2026-10-01T08:00:01.456Z');
const query = (input: Record<string, unknown> = {}) =>
  fulfillmentSyncQuerySchema.parse(input);
const lastCall = (mock: any) => mock.mock.calls.at(-1)[0];

function workOrder(
  workOrderNumber: string,
  updatedAt: Date,
  isDeleted = false,
) {
  return {
    customerName: 'C',
    deliveryDate: new Date('2026-12-01T00:00:00.000Z'),
    isDeleted,
    projectName: 'P',
    quantity: 2,
    status: 'OPEN',
    updatedAt,
    workOrderNumber,
  };
}

describe('fulfillmentSyncService cursor paging', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads from the beginning without a cursor and ends with a short page', async () => {
    db.work_orders.findMany.mockResolvedValue([workOrder('WO-1', T1)]);
    const page = await FulfillmentSyncService.list('work-orders', query());
    const args = lastCall(db.work_orders.findMany);
    expect(args.where).toEqual({});
    expect(args.take).toBe(100);
    expect(args.orderBy).toEqual([
      { updatedAt: 'asc' },
      { workOrderNumber: 'asc' },
    ]);
    expect(page.nextCursor).toBeNull();
    expect(page.items[0]).toMatchObject({
      deliveryDate: '2026-12-01T00:00:00.000Z',
      updatedAt: '2026-10-01T08:00:00.123Z',
    });
  });

  it('keeps rows sharing the cursor timestamp by comparing the key strictly', async () => {
    db.work_orders.findMany.mockResolvedValue([
      workOrder('WO-2', T1),
      workOrder('WO-3', T1),
    ]);
    const page = await FulfillmentSyncService.list(
      'work-orders',
      query({ afterId: 'WO-1', limit: '2', since: T1.toISOString() }),
    );
    const args = lastCall(db.work_orders.findMany);
    expect(args.take).toBe(2);
    expect(args.where).toEqual({
      OR: [
        { updatedAt: { gt: T1 } },
        { AND: [{ updatedAt: T1 }, { workOrderNumber: { gt: 'WO-1' } }] },
      ],
    });
    expect(page.nextCursor).toEqual({
      afterId: 'WO-3',
      since: '2026-10-01T08:00:00.123Z',
    });
  });

  it('includes rows at exactly since when no afterId is given', async () => {
    db.processes.findMany.mockResolvedValue([]);
    await FulfillmentSyncService.list(
      'processes',
      query({ since: T1.toISOString() }),
    );
    expect(lastCall(db.processes.findMany).where.OR[1]).toEqual({
      AND: [{ updatedAt: T1 }, { id: { gt: '' } }],
    });
  });

  it('includes soft-deleted rows instead of filtering them out', async () => {
    db.work_orders.findMany.mockResolvedValue([workOrder('WO-9', T2, true)]);
    const page = await FulfillmentSyncService.list('work-orders', query());
    expect(JSON.stringify(lastCall(db.work_orders.findMany).where)).not.toMatch(
      'isDeleted',
    );
    expect(page.items[0].isDeleted).toBe(true);
  });

  it('caps limit at 100 and rejects out-of-range or orphan cursor input', () => {
    expect(query().limit).toBe(100);
    expect(query({ limit: '100' }).limit).toBe(100);
    for (const input of [
      { limit: '101' },
      { limit: '0' },
      { limit: '1.5' },
      { since: '2026-10-01' },
      { afterId: 'x' },
      { since: ['a', 'b'] },
    ]) {
      expect(fulfillmentSyncQuerySchema.safeParse(input).success).toBe(false);
    }
  });
});

describe('fulfillmentSyncService resource shapes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('omits contact and credential fields from users', async () => {
    db.users.findMany.mockResolvedValue([
      {
        department: 'dept-1',
        id: 'u1',
        isDeleted: false,
        realName: 'R',
        status: 'INACTIVE',
        updatedAt: T1,
        username: 'u',
      },
    ]);
    const page = await FulfillmentSyncService.list('users', query());
    const { select } = lastCall(db.users.findMany);
    for (const field of ['phone', 'email', 'wechatWorkId', 'password']) {
      expect(select).not.toHaveProperty(field);
    }
    expect(page.items[0]).toEqual({
      departmentId: 'dept-1',
      id: 'u1',
      isActive: false,
      isDeleted: false,
      realName: 'R',
      updatedAt: T1.toISOString(),
      username: 'u',
    });
  });

  it('merges primary and linked work orders on inspections without duplicates', async () => {
    db.qms_inspection_requests.findMany.mockResolvedValue([
      {
        category: 'PROCESS',
        closedAt: null,
        id: 'r1',
        inspectionResult: 'FAIL',
        isDeleted: false,
        linkedIssueId: 'i1',
        linkedIssueNo: 'NC-1',
        partId: 'p1',
        partName: 'Part',
        processId: 'pr1',
        processName: 'Weld',
        quantity: 3,
        reporterId: 'u1',
        requestNo: 'BJ-1',
        status: 'INSPECTING',
        submittedAt: T1,
        supplierId: null,
        supplierName: null,
        team: 'Team A',
        teamId: 't1',
        unqualifiedQuantity: 1,
        updatedAt: T2,
        workOrderNumber: 'WO-1',
        workOrders: [
          { workOrderNumber: 'WO-1' },
          { workOrderNumber: 'WO-2' },
          { workOrderNumber: 'WO-2' },
        ],
      },
    ]);
    const page = await FulfillmentSyncService.list('inspections', query());
    expect(page.items[0]).toMatchObject({
      closedAt: null,
      inspectionResult: 'FAIL',
      status: 'INSPECTING',
      submittedAt: T1.toISOString(),
      teamName: 'Team A',
      workOrderNumbers: ['WO-1', 'WO-2'],
    });
    expect(page.items[0]).not.toHaveProperty('workOrders');
    expect(page.items[0]).not.toHaveProperty('team');
  });

  it('serves suppliers from the suppliers table only, never TEAM rows', async () => {
    db.suppliers.findMany.mockResolvedValue([
      {
        category: 'Outsourcing',
        id: 'SUP-2026-0001',
        isDeleted: false,
        name: 'S',
        outsourcingMode: 'IN_HOUSE_TEAM',
        status: 'Qualified',
        updatedAt: T1,
      },
      {
        category: null,
        id: 'SUP-2026-0009',
        isDeleted: true,
        name: 'S9',
        outsourcingMode: null,
        status: 'Qualified',
        updatedAt: T2,
      },
    ]);
    db.dictionaries.findMany.mockResolvedValue([
      {
        dictValue: 'Team',
        id: 'ct1',
        isDeleted: false,
        status: 1,
        updatedAt: T1,
      },
    ]);
    const page = await FulfillmentSyncService.list(
      'suppliers',
      query({ afterId: 'SUP-2026-0000', limit: '2', since: T1.toISOString() }),
    );
    expect(db.dictionaries.findMany).not.toHaveBeenCalled();
    expect(lastCall(db.suppliers.findMany).take).toBe(2);
    expect(page.items.map((item) => [item.kind, item.id])).toEqual([
      ['SUPPLIER', 'SUP-2026-0001'],
      ['SUPPLIER', 'SUP-2026-0009'],
    ]);
    expect(page.nextCursor).toEqual({
      afterId: 'SUP-2026-0009',
      since: T2.toISOString(),
    });
  });

  it('serves TEAM rows on the teams feed with their own cursor', async () => {
    db.dictionaries.findMany.mockResolvedValue([
      {
        dictValue: 'Team',
        id: 'ct1',
        isDeleted: false,
        status: 1,
        updatedAt: T1,
      },
      {
        dictValue: 'Old',
        id: 'ct3',
        isDeleted: true,
        status: 0,
        updatedAt: T1,
      },
    ]);
    const page = await FulfillmentSyncService.list(
      'teams',
      query({ afterId: 'ct0', limit: '2', since: T1.toISOString() }),
    );
    const args = lastCall(db.dictionaries.findMany);
    expect(db.suppliers.findMany).not.toHaveBeenCalled();
    expect(args.where).toEqual({
      dictType: 'team',
      OR: [
        { updatedAt: { gt: T1 } },
        { AND: [{ updatedAt: T1 }, { id: { gt: 'ct0' } }] },
      ],
    });
    expect(args.orderBy).toEqual([{ updatedAt: 'asc' }, { id: 'asc' }]);
    expect(args.take).toBe(2);
    expect(page.items).toEqual([
      {
        id: 'ct1',
        isDeleted: false,
        name: 'Team',
        status: 'ACTIVE',
        updatedAt: T1.toISOString(),
      },
      {
        id: 'ct3',
        isDeleted: true,
        name: 'Old',
        status: 'INACTIVE',
        updatedAt: T1.toISOString(),
      },
    ]);
    expect(page.nextCursor).toEqual({
      afterId: 'ct3',
      since: T1.toISOString(),
    });
  });
});

describe('fulfillmentSyncService work order BOM', () => {
  beforeEach(() => vi.clearAllMocks());

  const bomRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'bom-1',
    material: 'Q355B',
    partId: 'part-1',
    part_name: '主梁',
    part_number: 'DWG-001',
    processRequirements: [],
    quantity: 2,
    remarks: null,
    required_processes: null,
    unit: 'pcs',
    updated_at: T1,
    ...overrides,
  });

  it('returns an empty list for an unknown work order', async () => {
    db.project_boms.findMany.mockResolvedValue([]);
    const result = await FulfillmentSyncService.listWorkOrderBom('WO-NONE');
    expect(result).toEqual({ items: [], workOrderNumber: 'WO-NONE' });
    const args = lastCall(db.project_boms.findMany);
    expect(args.where).toEqual({ work_order_number: 'WO-NONE' });
    expect(args.select.processRequirements.orderBy).toEqual([
      { position: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('maps rows and keeps required processes in position order', async () => {
    db.project_boms.findMany.mockResolvedValue([
      bomRow({
        processRequirements: [
          {
            position: 0,
            process: { name: '组焊' },
            processId: 'prc-weld',
            processName: '焊接（旧名）',
          },
          {
            position: 3,
            process: null,
            processId: null,
            processName: '涂装',
          },
        ],
      }),
    ]);
    const { items } = await FulfillmentSyncService.listWorkOrderBom('WO-1');
    expect(items).toEqual([
      {
        id: 'bom-1',
        material: 'Q355B',
        partId: 'part-1',
        partName: '主梁',
        partNumber: 'DWG-001',
        processes: [
          { position: 0, processId: 'prc-weld', processName: '组焊' },
          { position: 1, processId: null, processName: '涂装' },
        ],
        quantity: 2,
        remarks: null,
        unit: 'pcs',
        updatedAt: '2026-10-01T08:00:00.123Z',
      },
    ]);
  });

  it('falls back to the legacy process snapshot without process ids', async () => {
    db.project_boms.findMany.mockResolvedValue([
      bomRow({ required_processes: '["下料","组焊"]' }),
    ]);
    const { items } = await FulfillmentSyncService.listWorkOrderBom('WO-1');
    expect(items[0]?.processes).toEqual([
      { position: 0, processId: null, processName: '下料' },
      { position: 1, processId: null, processName: '组焊' },
    ]);
  });
});
