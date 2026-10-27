import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserService } from '~/modules/user';
import prisma from '~/utils/prisma';

import { WorkOrderIntegrationService } from './work-order-integration.service';

const { mockAudit, mockCanonicalPair, mockWriteFields } = vi.hoisted(() => ({
  mockAudit: vi.fn(),
  mockCanonicalPair: vi.fn(),
  mockWriteFields: vi.fn(),
}));

vi.mock('~/utils/prisma', () => {
  const client = {
    $queryRawUnsafe: vi.fn(),
    work_orders: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return { default: client, prisma: client };
});
vi.mock('~/modules/user', () => ({
  UserService: { findExistingById: vi.fn() },
}));
// Create audits via the audit-log file, versioned writes via the module index.
vi.mock('~/modules/system-log/audit-log', () => ({
  recordBusinessAuditLog: mockAudit,
}));
vi.mock('~/modules/system-log', () => ({
  recordBusinessAuditLog: mockAudit,
}));
vi.mock('~/modules/data-scope', () => ({
  DataScopeService: { buildWorkOrderWhere: vi.fn() },
}));
vi.mock('~/utils/api-logger', () => ({ logApiError: vi.fn() }));
vi.mock('~/utils/redis', () => ({
  redis: { del: vi.fn(), get: vi.fn(), set: vi.fn() },
}));
vi.mock('~/utils/governed-write', () => ({
  buildGovernedCanonicalWritePairForTable: mockCanonicalPair,
  buildGovernedWriteFieldsForTable: mockWriteFields,
}));

/** Canonical names the (mocked) database returns for active IDs. */
const CANONICAL_NAMES: Record<string, string> = {
  'cust-1': '甲客户',
  'dept-1': '一事业部',
  'dept-2': '二事业部',
};

const db = prisma as any;
const event = { context: {}, node: { req: { socket: {} } } } as any;
const UPDATED_AT = new Date('2026-10-27T01:02:03.456Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    customerName: '甲客户',
    customerNameId: 'cust-1',
    deliveryDate: new Date('2026-12-01T00:00:00.000Z'),
    division: '一事业部',
    divisionId: 'dept-1',
    isDeleted: false,
    projectName: 'P',
    quantity: 3,
    status: 'OPEN',
    updatedAt: UPDATED_AT,
    version: 2,
    workOrderNumber: 'WO-1',
    ...overrides,
  };
}

const createInput = {
  actorUserId: 'user-7',
  customerNameId: 'cust-1',
  deliveryDate: '2026-12-01',
  divisionId: 'dept-1',
  projectName: 'P',
  quantity: 3,
  workOrderNumber: 'WO-1',
};

describe('workOrderIntegrationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$queryRawUnsafe.mockImplementation(async (_sql: string, id: string) =>
      CANONICAL_NAMES[id] ? [{ value: CANONICAL_NAMES[id] }] : [],
    );
    mockWriteFields.mockImplementation((_table: string, input: any) =>
      Object.fromEntries(
        ['customerName', 'division']
          .filter((key) => input[key] !== undefined)
          .map((key) => [key, input[key]]),
      ),
    );
    vi.mocked(UserService.findExistingById).mockResolvedValue({
      id: 'user-7',
      realName: 'Zhao',
      username: 'zhao',
    });
    mockCanonicalPair.mockImplementation(async (_table: string, input: any) => {
      const output: Record<string, null | string> = {};
      if (input.customerNameId === 'cust-1') {
        Object.assign(output, {
          customerName: '甲客户',
          customerNameId: 'cust-1',
        });
      } else if (input.customerNameId !== undefined) {
        throw new Error(
          `INVALID_CANONICAL_ID:customerName:${input.customerNameId}`,
        );
      }
      if (input.divisionId === 'dept-1') {
        Object.assign(output, { division: '一事业部', divisionId: 'dept-1' });
      } else if (input.divisionId === null) {
        output.divisionId = null;
      } else if (input.divisionId !== undefined) {
        throw new Error(`INVALID_CANONICAL_ID:division:${input.divisionId}`);
      }
      return output;
    });
    db.work_orders.findFirst.mockResolvedValue(row());
    db.work_orders.updateMany.mockResolvedValue({ count: 1 });
  });

  describe('create', () => {
    it('creates an OPEN order with names resolved from IDs and audits the actor', async () => {
      db.work_orders.findUnique.mockResolvedValue(null);
      db.work_orders.create.mockResolvedValue(row({ version: 1 }));
      db.work_orders.findFirst.mockResolvedValue(row({ version: 1 }));

      const result = await WorkOrderIntegrationService.create(
        event,
        createInput,
      );

      expect(db.work_orders.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          customerName: '甲客户',
          customerNameId: 'cust-1',
          deliveryDate: new Date('2026-12-01T00:00:00.000Z'),
          division: '一事业部',
          divisionId: 'dept-1',
          effectiveTime: null,
          multiStationEnabled: false,
          quantity: 3,
          status: 'OPEN',
          workOrderNumber: 'WO-1',
        }),
      });
      expect(mockAudit).toHaveBeenCalledWith(
        event,
        expect.objectContaining({
          action: 'CREATE',
          targetId: 'WO-1',
          userId: 'user-7',
        }),
      );
      expect(result).toEqual({
        customerName: '甲客户',
        customerNameId: 'cust-1',
        deliveryDate: '2026-12-01T00:00:00.000Z',
        division: '一事业部',
        divisionId: 'dept-1',
        isDeleted: false,
        projectName: 'P',
        quantity: 3,
        status: 'OPEN',
        updatedAt: '2026-10-27T01:02:03.456Z',
        version: 1,
        workOrderNumber: 'WO-1',
      });
    });

    it('rejects an active duplicate number with 409 WORK_ORDER_EXISTS', async () => {
      db.work_orders.findUnique.mockResolvedValue(row());

      await expect(
        WorkOrderIntegrationService.create(event, createInput),
      ).rejects.toMatchObject({ code: 'WORK_ORDER_EXISTS', httpStatus: 409 });
      expect(db.work_orders.create).not.toHaveBeenCalled();
      expect(db.work_orders.update).not.toHaveBeenCalled();
    });

    it('restores a soft-deleted order with the same number', async () => {
      db.work_orders.findUnique.mockResolvedValue(row({ isDeleted: true }));
      db.work_orders.update.mockResolvedValue(row());

      await WorkOrderIntegrationService.create(event, createInput);

      expect(db.work_orders.update).toHaveBeenCalledWith({
        where: { workOrderNumber: 'WO-1' },
        data: expect.objectContaining({ isDeleted: false, status: 'OPEN' }),
      });
      expect(mockAudit).toHaveBeenCalledWith(
        event,
        expect.objectContaining({ action: 'UPDATE', userId: 'user-7' }),
      );
    });

    it('rejects an unknown or deleted actor with 400 before writing', async () => {
      vi.mocked(UserService.findExistingById).mockResolvedValue(null);

      await expect(
        WorkOrderIntegrationService.create(event, createInput),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST', httpStatus: 400 });
      expect(db.work_orders.findUnique).not.toHaveBeenCalled();
    });

    it('rejects an invalid customer or division ID with 400', async () => {
      await expect(
        WorkOrderIntegrationService.create(event, {
          ...createInput,
          customerNameId: 'missing',
        }),
      ).rejects.toMatchObject({
        httpStatus: 400,
        message: expect.stringContaining('客户无效'),
      });
      await expect(
        WorkOrderIntegrationService.create(event, {
          ...createInput,
          divisionId: 'missing',
        }),
      ).rejects.toMatchObject({
        httpStatus: 400,
        message: expect.stringContaining('事业部无效'),
      });
      expect(db.work_orders.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('applies a versioned update and returns the updated order', async () => {
      db.work_orders.findFirst
        .mockResolvedValueOnce(row())
        .mockResolvedValueOnce(row())
        .mockResolvedValueOnce(row({ quantity: 9, version: 3 }));

      const result = await WorkOrderIntegrationService.update(event, 'WO-1', {
        actorUserId: 'user-7',
        quantity: 9,
        status: 'IN_PROGRESS',
        version: 2,
      });

      expect(db.work_orders.updateMany).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          status: { not: 'CANCELLED' },
          version: 2,
          workOrderNumber: 'WO-1',
        },
        data: expect.objectContaining({
          quantity: 9,
          status: 'IN_PROGRESS',
          version: { increment: 1 },
        }),
      });
      expect(mockAudit).toHaveBeenCalledWith(
        event,
        expect.objectContaining({
          action: 'UPDATE',
          detailsTemplate: expect.stringContaining('来源: {{channel}}'),
          detailsVariables: expect.objectContaining({ channel: '履约系统' }),
          userId: 'user-7',
        }),
      );
      expect(result).toMatchObject({ quantity: 9, version: 3 });
    });

    it('returns 409 OPTIMISTIC_LOCK_CONFLICT for a stale version', async () => {
      db.work_orders.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        WorkOrderIntegrationService.update(event, 'WO-1', {
          actorUserId: 'user-7',
          quantity: 9,
          version: 1,
        }),
      ).rejects.toMatchObject({
        code: 'OPTIMISTIC_LOCK_CONFLICT',
        httpStatus: 409,
      });
      expect(mockAudit).not.toHaveBeenCalled();
    });

    it('rejects renaming the work order number with 400 and never writes', async () => {
      await expect(
        WorkOrderIntegrationService.update(event, 'WO-1', {
          actorUserId: 'user-7',
          version: 2,
          workOrderNumber: 'WO-2',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST', httpStatus: 400 });
      expect(db.work_orders.updateMany).not.toHaveBeenCalled();
    });

    it('accepts the same work order number in the body', async () => {
      await WorkOrderIntegrationService.update(event, 'WO-1', {
        actorUserId: 'user-7',
        version: 2,
        workOrderNumber: ' WO-1 ',
      });
      expect(db.work_orders.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            workOrderNumber: expect.anything(),
          }),
        }),
      );
    });

    it('refuses to modify a cancelled order with 400', async () => {
      db.work_orders.findFirst.mockResolvedValue(row({ status: 'CANCELLED' }));

      await expect(
        WorkOrderIntegrationService.update(event, 'WO-1', {
          actorUserId: 'user-7',
          quantity: 9,
          version: 2,
        }),
      ).rejects.toMatchObject({ httpStatus: 400 });
      expect(db.work_orders.updateMany).not.toHaveBeenCalled();
    });

    it('returns 404 for a missing or deleted order', async () => {
      db.work_orders.findFirst.mockResolvedValue(null);

      await expect(
        WorkOrderIntegrationService.update(event, 'WO-X', {
          actorUserId: 'user-7',
          version: 1,
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', httpStatus: 404 });
    });

    it('clears both division name and ID when divisionId is null', async () => {
      await WorkOrderIntegrationService.update(event, 'WO-1', {
        actorUserId: 'user-7',
        divisionId: null,
        version: 2,
      });
      expect(db.work_orders.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ division: null, divisionId: null }),
        }),
      );
    });
  });

  describe('cancel', () => {
    it('cancels with the version CAS and audits the actor', async () => {
      db.work_orders.findFirst
        .mockResolvedValueOnce(row())
        .mockResolvedValueOnce(row())
        .mockResolvedValueOnce(row({ status: 'CANCELLED', version: 3 }));

      const result = await WorkOrderIntegrationService.cancel(event, 'WO-1', {
        actorUserId: 'user-7',
        version: 2,
      });

      expect(db.work_orders.updateMany).toHaveBeenCalledWith({
        where: { isDeleted: false, version: 2, workOrderNumber: 'WO-1' },
        data: expect.objectContaining({
          status: 'CANCELLED',
          version: { increment: 1 },
        }),
      });
      expect(mockAudit).toHaveBeenCalledWith(
        event,
        expect.objectContaining({
          detailsTemplate: expect.stringContaining('取消工单'),
          userId: 'user-7',
        }),
      );
      expect(result).toMatchObject({ status: 'CANCELLED', version: 3 });
    });

    it('is idempotent for an already cancelled order, whatever the version', async () => {
      db.work_orders.findFirst.mockResolvedValue(
        row({ status: 'CANCELLED', version: 5 }),
      );

      const result = await WorkOrderIntegrationService.cancel(event, 'WO-1', {
        actorUserId: 'user-7',
        version: 1,
      });

      expect(result).toMatchObject({ status: 'CANCELLED', version: 5 });
      expect(db.work_orders.updateMany).not.toHaveBeenCalled();
      expect(mockAudit).not.toHaveBeenCalled();
    });

    it('treats losing the version race to another cancel as success', async () => {
      db.work_orders.findFirst
        .mockResolvedValueOnce(row())
        .mockResolvedValueOnce(row())
        .mockResolvedValueOnce(row({ status: 'CANCELLED', version: 3 }))
        .mockResolvedValueOnce(row({ status: 'CANCELLED', version: 3 }));
      db.work_orders.updateMany.mockResolvedValue({ count: 0 });

      const result = await WorkOrderIntegrationService.cancel(event, 'WO-1', {
        actorUserId: 'user-7',
        version: 2,
      });

      expect(result).toMatchObject({ status: 'CANCELLED', version: 3 });
    });

    it('still reports 409 when a stale version races a non-cancel edit', async () => {
      db.work_orders.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        WorkOrderIntegrationService.cancel(event, 'WO-1', {
          actorUserId: 'user-7',
          version: 1,
        }),
      ).rejects.toMatchObject({
        code: 'OPTIMISTIC_LOCK_CONFLICT',
        httpStatus: 409,
      });
    });
  });
});

/**
 * Regression: the real governed helper turns an explicit `divisionId: null`
 * into "keep the stored ID", so only the database is mocked here.
 */
describe('workOrderIntegrationService with the real governed write', () => {
  function writtenData() {
    return db.work_orders.updateMany.mock.calls.at(-1)[0].data;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const actual = await vi.importActual<
      typeof import('~/utils/governed-write')
    >('~/utils/governed-write');
    mockCanonicalPair.mockImplementation(
      actual.buildGovernedCanonicalWritePairForTable,
    );
    mockWriteFields.mockImplementation(actual.buildGovernedWriteFieldsForTable);
    db.$queryRawUnsafe.mockImplementation(async (_sql: string, id: string) =>
      CANONICAL_NAMES[id] ? [{ value: CANONICAL_NAMES[id] }] : [],
    );
    vi.mocked(UserService.findExistingById).mockResolvedValue({
      id: 'user-7',
      realName: 'Zhao',
      username: 'zhao',
    });
    db.work_orders.findFirst.mockResolvedValue(row());
    db.work_orders.updateMany.mockResolvedValue({ count: 1 });
  });

  it('clears both the division name and its canonical ID for divisionId: null', async () => {
    await WorkOrderIntegrationService.update(event, 'WO-1', {
      actorUserId: 'user-7',
      divisionId: null,
      version: 2,
    });
    expect(writtenData()).toMatchObject({ division: null, divisionId: null });
  });

  it('writes the resolved name and ID when the division changes', async () => {
    await WorkOrderIntegrationService.update(event, 'WO-1', {
      actorUserId: 'user-7',
      divisionId: 'dept-2',
      version: 2,
    });
    expect(writtenData()).toMatchObject({
      division: '二事业部',
      divisionId: 'dept-2',
    });
  });

  it('leaves the division untouched when divisionId is omitted', async () => {
    await WorkOrderIntegrationService.update(event, 'WO-1', {
      actorUserId: 'user-7',
      customerNameId: 'cust-1',
      version: 2,
    });
    expect(writtenData()).toMatchObject({
      customerName: '甲客户',
      customerNameId: 'cust-1',
    });
    expect(writtenData()).not.toHaveProperty('division');
    expect(writtenData()).not.toHaveProperty('divisionId');
  });

  it('rejects an unknown division ID with 400 before writing', async () => {
    await expect(
      WorkOrderIntegrationService.update(event, 'WO-1', {
        actorUserId: 'user-7',
        divisionId: 'dept-missing',
        version: 2,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', httpStatus: 400 });
    expect(db.work_orders.updateMany).not.toHaveBeenCalled();
  });
});
