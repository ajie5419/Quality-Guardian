import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from '~/utils/current-user';
import prisma from '~/utils/prisma';

import { buildQualityLossCreateRequestFingerprint } from './quality-loss-create-fingerprint';

const mocks = vi.hoisted(() => ({
  auditLog: vi.fn(),
  claimCreate: vi.fn(),
  completeUpdate: vi.fn(),
  departmentFindMany: vi.fn(),
  enqueue: vi.fn(),
  findUnique: vi.fn(),
  getHeader: vi.fn(),
  lossCreate: vi.fn(),
  readBody: vi.fn(),
  resourceFindFirst: vi.fn(),
  setResponseStatus: vi.fn(),
}));

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getHeader: mocks.getHeader,
  readBody: mocks.readBody,
  setResponseStatus: mocks.setResponseStatus,
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn(),
    idempotency_requests: {
      create: mocks.claimCreate,
      findUnique: mocks.findUnique,
      updateMany: mocks.completeUpdate,
    },
    quality_losses: {
      findFirst: mocks.resourceFindFirst,
    },
    departments: {
      findMany: mocks.departmentFindMany,
    },
  },
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('~/modules/quality-loss/quality-loss-manual-context', () => ({
  resolveManualQualityLossContext: vi.fn(async () => ({
    partId: 'part-1',
    partName: '阀体',
    projectId: 'proj-1',
    projectName: '项目甲',
    workOrderNumber: 'WO-2026-001',
  })),
}));

vi.mock('~/modules/quality-loss/quality-loss-department-write', () => ({
  resolveQualityLossDepartmentWrite: vi.fn(async () => ({
    respDept: '采购部',
    respDeptId: 'dept-1',
  })),
}));

vi.mock('~/modules/quality-loss/quality-loss-payload', () => ({
  buildQualityLossCreateDataWithCanonical: vi.fn(async (body) => body),
  buildQualityLossCreateResponse: vi.fn((item) => item),
  createQualityLossId: vi.fn(() => 'QL-2026-TEST01'),
}));

vi.mock('~/modules/quality-loss/quality-loss-index-queue.service', () => ({
  QualityLossIndexQueue: { enqueue: mocks.enqueue },
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: { auditLog: mocks.auditLog },
}));

const tx = {
  idempotency_requests: {
    create: mocks.claimCreate,
    updateMany: mocks.completeUpdate,
  },
  quality_losses: {
    create: mocks.lossCreate,
  },
};

const event = {
  context: { requestId: 'req-1' },
  method: 'POST',
  node: {
    req: { method: 'POST', url: '/qms/quality-loss' },
  },
  path: '/qms/quality-loss',
} as never;

const body = {
  actualClaim: 80,
  amount: 100,
  date: '2026-08-20',
  description: '批量划伤',
  partName: '阀体',
  responsibleDepartmentId: 'dept-1',
  type: 'Scrap',
  workOrderNumber: 'WO-2026-001',
};

const requestFingerprint = buildQualityLossCreateRequestFingerprint(body, {
  partId: 'part-1',
  partName: '阀体',
  projectId: 'proj-1',
  projectName: '项目甲',
  workOrderNumber: 'WO-2026-001',
});

function p2002(): never {
  throw Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    meta: { target: ['actorKey', 'operationKey', 'idempotencyKey'] },
  });
}

describe('quality-loss create (IDEMPOTENCY-KEY-001 pilot)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) =>
      callback(tx),
    );
    vi.mocked(getCurrentUser).mockReturnValue({
      id: 'user-1',
      realName: '张三',
      username: 'zhangsan',
    } as never);
    mocks.getHeader.mockReturnValue('client-key-001');
    mocks.readBody.mockResolvedValue(body);
    mocks.claimCreate.mockResolvedValue({ id: 'claim-1' });
    mocks.completeUpdate.mockResolvedValue({ count: 1 });
    mocks.findUnique.mockResolvedValue(null);
    mocks.departmentFindMany.mockResolvedValue([]);
    mocks.lossCreate.mockImplementation(async (data: { lossId?: string }) => ({
      id: 'ql-1',
      lossId: data.lossId,
      amount: 100,
      type: 'Scrap',
      respDept: '采购部',
      occurDate: new Date('2026-08-20T00:00:00Z'),
    }));
    mocks.resourceFindFirst.mockResolvedValue({ id: 'ql-1' });
  });

  it('rejects a missing Idempotency-Key header with 400', async () => {
    mocks.getHeader.mockReturnValue(undefined);
    const handlerModule = await import('./quality-loss-create.post.service');
    const handler = handlerModule.default;
    const response = await handler(event);
    expect(response).toEqual(
      expect.objectContaining({
        code: -1,
        message: expect.stringContaining('Idempotency-Key'),
      }),
    );
    expect(mocks.lossCreate).not.toHaveBeenCalled();
  });

  it('creates one loss and writes the business audit on first success', async () => {
    const handlerModule = await import('./quality-loss-create.post.service');
    const handler = handlerModule.default;
    const response = await handler(event);
    expect(mocks.claimCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorKey: 'user:user-1',
        idempotencyKey: 'client-key-001',
        operationKey: 'qms.quality-loss.create',
      }),
    });
    expect(mocks.lossCreate).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue).toHaveBeenCalledWith(
      tx,
      [{ source: 'MANUAL', sourcePk: 'ql-1' }],
      'quality-loss.created',
    );
    expect(mocks.auditLog).toHaveBeenCalledWith('quality-loss', 'create', {
      userId: 'user-1',
      targetId: 'ql-1',
      detailsVariables: { amount: 100, type: 'Scrap' },
    });
    expect(response).toEqual(
      expect.objectContaining({ data: expect.anything() }),
    );
  });

  it('replays the first result without creating a second loss or audit', async () => {
    mocks.claimCreate.mockImplementationOnce(p2002);
    mocks.findUnique.mockResolvedValue({
      actorKey: 'user:user-1',
      expiresAt: new Date(Date.now() + 60_000),
      idempotencyKey: 'client-key-001',
      operationKey: 'qms.quality-loss.create',
      requestFingerprint,
      resourceId: 'ql-1',
      resourceType: 'quality_losses',
      responseBody: { id: 'ql-1', amount: 100, type: 'Scrap' },
      responseStatus: 200,
      status: 'COMPLETED',
    });
    const handlerModule = await import('./quality-loss-create.post.service');
    const handler = handlerModule.default;
    const response = await handler(event);
    expect(mocks.lossCreate).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.auditLog).not.toHaveBeenCalled();
    expect(response).toEqual(
      expect.objectContaining({
        data: { id: 'ql-1', amount: 100, type: 'Scrap' },
      }),
    );
  });

  it('revalidates a replay with the current SELF data scope', async () => {
    mocks.claimCreate.mockImplementationOnce(p2002);
    mocks.findUnique.mockResolvedValue({
      actorKey: 'user:user-1',
      expiresAt: new Date(Date.now() + 60_000),
      idempotencyKey: 'client-key-001',
      operationKey: 'qms.quality-loss.create',
      requestFingerprint,
      resourceId: 'ql-1',
      resourceType: 'quality_losses',
      responseBody: { id: 'ql-1', amount: 100, type: 'Scrap' },
      responseStatus: 200,
      status: 'COMPLETED',
    });
    const handlerModule = await import('./quality-loss-create.post.service');
    const handler = handlerModule.default;
    await handler({
      context: {
        dataScope: { deptIds: [], scopeType: 'SELF' },
        requestId: 'req-1',
      },
      method: 'POST',
      node: { req: { method: 'POST', url: '/qms/quality-loss' } },
      path: '/qms/quality-loss',
    } as never);
    expect(mocks.resourceFindFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        AND: [{ id: 'ql-1', isDeleted: false }, { createdBy: 'user-1' }],
      },
    });
  });

  it('rejects the same key with a changed fingerprint (409 REUSED)', async () => {
    mocks.claimCreate.mockImplementationOnce(p2002);
    mocks.findUnique.mockResolvedValue({
      actorKey: 'user:user-1',
      expiresAt: new Date(Date.now() + 60_000),
      idempotencyKey: 'client-key-001',
      operationKey: 'qms.quality-loss.create',
      requestFingerprint: 'fp-of-a-different-payload',
      resourceId: 'ql-1',
      resourceType: 'quality_losses',
      responseBody: { id: 'ql-1', amount: 999 },
      responseStatus: 200,
      status: 'COMPLETED',
    });
    const handlerModule = await import('./quality-loss-create.post.service');
    const handler = handlerModule.default;
    const response = await handler(event);
    expect(mocks.setResponseStatus).toHaveBeenCalledWith(event, 409);
    expect(response).toEqual(
      expect.objectContaining({
        error: { code: 'IDEMPOTENCY_KEY_REUSED' },
      }),
    );
    expect(mocks.lossCreate).not.toHaveBeenCalled();
  });

  it('does not mark COMPLETED when the business write fails', async () => {
    mocks.lossCreate.mockRejectedValueOnce(new Error('db boom'));
    const handlerModule = await import('./quality-loss-create.post.service');
    const handler = handlerModule.default;
    await expect(handler(event)).resolves.toEqual(
      expect.objectContaining({ code: -1 }),
    );
    expect(mocks.completeUpdate).not.toHaveBeenCalled();
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });
});
