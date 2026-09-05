import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

const mocks = vi.hoisted(() => ({
  claimCreate: vi.fn(),
  completeUpdate: vi.fn(),
  findUnique: vi.fn(),
  resourceFindFirst: vi.fn(),
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
  },
}));

const tx = {
  idempotency_requests: {
    create: mocks.claimCreate,
    findUnique: mocks.findUnique,
    updateMany: mocks.completeUpdate,
  },
};

const baseOptions = {
  actorKey: 'user-1',
  expiresAt: new Date('2026-08-20T23:00:00Z'),
  idempotencyKey: 'client-key-001',
  operationKey: 'qms.quality-loss.create',
  prisma,
  requestFingerprint: 'fp-abc',
  run: vi.fn(async () => ({
    resourceId: 'ql-1',
    resourceType: 'quality_losses',
    response: { id: 'ql-1', amount: 100 },
  })),
};

function p2002(
  _ignored: unknown = undefined,
  target: string[] = ['actorKey', 'operationKey', 'idempotencyKey'],
): never {
  throw Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    meta: { target },
  });
}

function completedClaim(overrides: Record<string, unknown> = {}) {
  return {
    actorKey: 'user-1',
    expiresAt: new Date('2099-01-01T00:00:00Z'),
    idempotencyKey: 'client-key-001',
    operationKey: 'qms.quality-loss.create',
    requestFingerprint: 'fp-abc',
    resourceId: 'ql-1',
    resourceType: 'quality_losses',
    responseBody: { id: 'ql-1', amount: 100 },
    responseStatus: 200,
    status: 'COMPLETED',
    ...overrides,
  };
}

describe('withRequestIdempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) =>
      callback(tx),
    );
    mocks.claimCreate.mockResolvedValue({ id: 'claim-1' });
    mocks.completeUpdate.mockResolvedValue({ count: 1 });
    mocks.findUnique.mockResolvedValue(null);
    mocks.resourceFindFirst.mockResolvedValue({ id: 'ql-1' });
  });

  it('claims PROCESSING, runs the business write and marks COMPLETED in one transaction', async () => {
    const { withRequestIdempotency } = await import('./request-idempotency');
    const outcome = await withRequestIdempotency(baseOptions);
    expect(mocks.claimCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorKey: 'user-1',
        idempotencyKey: 'client-key-001',
        operationKey: 'qms.quality-loss.create',
        requestFingerprint: 'fp-abc',
      }),
    });
    expect(baseOptions.run).toHaveBeenCalledWith(tx);
    expect(mocks.completeUpdate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resourceId: 'ql-1',
        resourceType: 'quality_losses',
        status: 'COMPLETED',
      }),
      where: expect.objectContaining({ status: 'PROCESSING' }),
    });
    expect(outcome).toEqual({
      replayed: false,
      resourceId: 'ql-1',
      resourceType: 'quality_losses',
      response: { id: 'ql-1', amount: 100 },
      responseStatus: 200,
    });
  });

  it('replays the first result for the same key and fingerprint', async () => {
    mocks.claimCreate.mockImplementationOnce(p2002);
    mocks.findUnique.mockResolvedValue({
      actorKey: 'user-1',
      expiresAt: new Date('2099-01-01T00:00:00Z'),
      idempotencyKey: 'client-key-001',
      operationKey: 'qms.quality-loss.create',
      requestFingerprint: 'fp-abc',
      resourceId: 'ql-1',
      resourceType: 'quality_losses',
      responseBody: { id: 'ql-1', amount: 100 },
      responseStatus: 200,
      status: 'COMPLETED',
    });
    const { withRequestIdempotency } = await import('./request-idempotency');
    const outcome = await withRequestIdempotency(baseOptions);
    expect(baseOptions.run).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      replayed: true,
      resourceId: 'ql-1',
      resourceType: 'quality_losses',
      response: { id: 'ql-1', amount: 100 },
      responseStatus: 200,
    });
  });

  it('rejects a reused key with a different fingerprint', async () => {
    mocks.claimCreate.mockImplementationOnce(p2002);
    mocks.findUnique.mockResolvedValue({
      actorKey: 'user-1',
      expiresAt: new Date('2099-01-01T00:00:00Z'),
      idempotencyKey: 'client-key-001',
      operationKey: 'qms.quality-loss.create',
      requestFingerprint: 'fp-other',
      resourceId: 'ql-1',
      resourceType: 'quality_losses',
      responseBody: { id: 'ql-1', amount: 100 },
      responseStatus: 200,
      status: 'COMPLETED',
    });
    const { withRequestIdempotency, IdempotencyKeyReusedError } = await import(
      './request-idempotency'
    );
    await expect(withRequestIdempotency(baseOptions)).rejects.toBeInstanceOf(
      IdempotencyKeyReusedError,
    );
    expect(baseOptions.run).not.toHaveBeenCalled();
  });

  it('returns IN_PROGRESS when the existing claim is still PROCESSING', async () => {
    mocks.claimCreate.mockImplementationOnce(p2002);
    mocks.findUnique.mockResolvedValue({
      actorKey: 'user-1',
      expiresAt: new Date('2099-01-01T00:00:00Z'),
      idempotencyKey: 'client-key-001',
      operationKey: 'qms.quality-loss.create',
      requestFingerprint: 'fp-abc',
      resourceId: null,
      resourceType: null,
      responseBody: null,
      responseStatus: null,
      status: 'PROCESSING',
    });
    const { withRequestIdempotency, IdempotencyRequestInProgressError } =
      await import('./request-idempotency');
    await expect(withRequestIdempotency(baseOptions)).rejects.toBeInstanceOf(
      IdempotencyRequestInProgressError,
    );
    expect(baseOptions.run).not.toHaveBeenCalled();
  });

  it('re-claims when the losing insert finds no settled record (winner rolled back)', async () => {
    mocks.claimCreate.mockImplementationOnce(p2002).mockResolvedValueOnce({
      id: 'claim-2',
    });
    mocks.findUnique.mockResolvedValue(null);
    const { withRequestIdempotency } = await import('./request-idempotency');
    const outcome = await withRequestIdempotency(baseOptions);
    expect(mocks.claimCreate).toHaveBeenCalledTimes(2);
    expect(outcome.replayed).toBe(false);
  });

  it('rolls back the claim when the business write fails (no COMPLETED zombie)', async () => {
    const run = vi.fn(async () => {
      throw new Error('business boom');
    });
    const { withRequestIdempotency } = await import('./request-idempotency');
    await expect(
      withRequestIdempotency({ ...baseOptions, run }),
    ).rejects.toThrow('business boom');
    expect(mocks.completeUpdate).not.toHaveBeenCalled();
  });

  it('passes distinct actors independently (user isolation)', async () => {
    const { withRequestIdempotency } = await import('./request-idempotency');
    await withRequestIdempotency(baseOptions);
    await withRequestIdempotency({ ...baseOptions, actorKey: 'user-2' });
    expect(mocks.claimCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ actorKey: 'user-1' }),
      }),
    );
    expect(mocks.claimCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ actorKey: 'user-2' }),
      }),
    );
  });

  it('passes distinct operations independently (operation isolation)', async () => {
    const { withRequestIdempotency } = await import('./request-idempotency');
    await withRequestIdempotency(baseOptions);
    await withRequestIdempotency({
      ...baseOptions,
      operationKey: 'qms.after-sales.create',
    });
    expect(mocks.claimCreate).toHaveBeenCalledTimes(2);
  });

  it('rejects a replay whose resource no longer passes the resource guard', async () => {
    mocks.claimCreate.mockImplementationOnce(p2002);
    mocks.findUnique.mockResolvedValue(
      completedClaim({
        resourceId: 'ql-deleted',
        resourceType: 'quality_losses',
        responseBody: { id: 'ql-deleted', amount: 100 },
        responseStatus: 200,
      }),
    );
    mocks.resourceFindFirst.mockResolvedValue(null);
    const { withRequestIdempotency } = await import('./request-idempotency');
    await expect(
      withRequestIdempotency({
        ...baseOptions,
        resourceGuard: async (client, resourceId) => {
          const row = await client.quality_losses.findFirst({
            select: { id: true },
            where: { id: resourceId, isDeleted: false },
          });
          return Boolean(row);
        },
      }),
    ).rejects.toBeInstanceOf(BusinessError);
    expect(baseOptions.run).not.toHaveBeenCalled();
  });

  it('propagates the expiresAt window into the claim row', async () => {
    const { withRequestIdempotency } = await import('./request-idempotency');
    await withRequestIdempotency(baseOptions);
    expect(mocks.claimCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        expiresAt: new Date('2026-08-20T23:00:00Z'),
      }),
    });
  });

  it('rethrows a business unique conflict (requestNo/serial) instead of replaying', async () => {
    const run = vi.fn(async () => {
      throw p2002(undefined, ['requestNo']);
    });
    const { withRequestIdempotency } = await import('./request-idempotency');
    await expect(
      withRequestIdempotency({ ...baseOptions, run }),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('atomically reclaims an expired COMPLETED claim and runs the create again', async () => {
    mocks.claimCreate.mockImplementationOnce(p2002);
    mocks.findUnique.mockResolvedValue(
      completedClaim({
        expiresAt: new Date(Date.now() - 60_000),
        requestFingerprint: 'fp-old',
      }),
    );
    const { withRequestIdempotency } = await import('./request-idempotency');
    const outcome = await withRequestIdempotency(baseOptions);
    expect(baseOptions.run).toHaveBeenCalledTimes(1);
    expect(outcome.replayed).toBe(false);
    expect(mocks.completeUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          requestFingerprint: 'fp-abc',
          status: 'PROCESSING',
        }),
        where: expect.objectContaining({
          expiresAt: { lte: expect.any(Date) },
          status: { in: ['PROCESSING', 'COMPLETED'] },
        }),
      }),
    );
    expect(mocks.completeUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  it('reclaims an expired PROCESSING claim (stale owner) as a new request', async () => {
    mocks.claimCreate.mockImplementationOnce(p2002);
    mocks.findUnique.mockResolvedValue(
      completedClaim({
        expiresAt: new Date(Date.now() - 60_000),
        requestFingerprint: 'fp-old',
        status: 'PROCESSING',
      }),
    );
    const { withRequestIdempotency } = await import('./request-idempotency');
    const outcome = await withRequestIdempotency(baseOptions);
    expect(outcome.replayed).toBe(false);
    expect(baseOptions.run).toHaveBeenCalledTimes(1);
  });

  it('lets only one of two concurrent reclaims become the new owner', async () => {
    mocks.claimCreate.mockImplementationOnce(p2002);
    mocks.findUnique.mockResolvedValueOnce(
      completedClaim({
        expiresAt: new Date(Date.now() - 60_000),
        requestFingerprint: 'fp-old',
      }),
    );
    mocks.completeUpdate.mockResolvedValueOnce({ count: 0 });
    mocks.findUnique.mockResolvedValueOnce(
      completedClaim({
        expiresAt: new Date(Date.now() + 300_000),
        requestFingerprint: 'fp-abc',
        resourceId: null,
        resourceType: null,
        responseBody: null,
        responseStatus: null,
        status: 'PROCESSING',
      }),
    );
    const { withRequestIdempotency, IdempotencyRequestInProgressError } =
      await import('./request-idempotency');
    await expect(withRequestIdempotency(baseOptions)).rejects.toBeInstanceOf(
      IdempotencyRequestInProgressError,
    );
    expect(baseOptions.run).not.toHaveBeenCalled();
  });

  it('rejects a reclaim that resolves to a fresh claim with a different fingerprint', async () => {
    mocks.claimCreate.mockImplementationOnce(p2002);
    mocks.findUnique.mockResolvedValueOnce(
      completedClaim({
        expiresAt: new Date(Date.now() - 60_000),
        requestFingerprint: 'fp-old',
      }),
    );
    mocks.completeUpdate.mockResolvedValueOnce({ count: 0 });
    mocks.findUnique.mockResolvedValueOnce(
      completedClaim({
        expiresAt: new Date(Date.now() + 300_000),
        requestFingerprint: 'fp-different',
      }),
    );
    const { withRequestIdempotency, IdempotencyKeyReusedError } = await import(
      './request-idempotency'
    );
    await expect(withRequestIdempotency(baseOptions)).rejects.toBeInstanceOf(
      IdempotencyKeyReusedError,
    );
  });
});
