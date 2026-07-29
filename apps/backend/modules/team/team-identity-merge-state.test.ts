import type { TeamMergeAttempt } from './team-identity-merge-state';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import {
  acquireTeamMerge,
  addReferenceCounts,
  markMergeAttemptFailed,
  renewMergeLease,
} from './team-identity-merge-state';

const mocks = vi.hoisted(() => ({
  tx: {
    $queryRaw: vi.fn(),
    dictionaries: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    supplier_identity_links: { findMany: vi.fn() },
    team_identity_merge_participants: {
      createMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    team_identity_merges: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    ...mocks.tx,
    $transaction: vi.fn(),
  },
}));

const input = {
  operator: 'admin',
  reason: 'Confirmed duplicate',
  sourceTeamId: 'team-source',
  targetTeamId: 'team-target',
};
const sourceTeam = {
  dictKey: 'Structure BU2',
  id: input.sourceTeamId,
  isSystem: false,
  status: 1,
};
const targetTeam = {
  dictKey: 'StructureBU2',
  id: input.targetTeamId,
  isSystem: false,
  status: 1,
};
const attempt: TeamMergeAttempt = {
  attemptToken: 'attempt-1',
  auditId: 'merge-1',
  operator: input.operator,
  sourceName: sourceTeam.dictKey,
  sourceTeamId: sourceTeam.id,
  targetName: targetTeam.dictKey,
  targetTeamId: targetTeam.id,
};

function existingMerge(overrides: Record<string, unknown> = {}) {
  return {
    attemptToken: null,
    completedAt: null,
    createdAt: new Date('2026-07-28T00:00:00.000Z'),
    failureCount: 0,
    id: attempt.auditId,
    idempotencyKey: `team-merge:${sourceTeam.id}`,
    isDeleted: false,
    lastError: null,
    leaseUntil: null,
    operator: input.operator,
    reason: input.reason,
    referenceCounts: null,
    sourceNameSnapshot: sourceTeam.dictKey,
    sourceTeamId: sourceTeam.id,
    status: 'FAILED',
    targetNameSnapshot: targetTeam.dictKey,
    targetTeamId: targetTeam.id,
    updatedAt: new Date('2026-07-28T00:00:00.000Z'),
    ...overrides,
  };
}

describe('team identity merge state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) =>
      callback(mocks.tx),
    );
    mocks.tx.$queryRaw.mockResolvedValue([]);
    mocks.tx.dictionaries.findMany.mockResolvedValue([sourceTeam, targetTeam]);
    mocks.tx.supplier_identity_links.findMany.mockResolvedValue([]);
    mocks.tx.team_identity_merge_participants.findFirst.mockResolvedValue(null);
    mocks.tx.team_identity_merge_participants.findMany.mockResolvedValue([]);
    mocks.tx.team_identity_merges.findUnique.mockResolvedValue(null);
    mocks.tx.team_identity_merges.create.mockResolvedValue({
      id: attempt.auditId,
    });
    mocks.tx.team_identity_merges.updateMany.mockResolvedValue({ count: 1 });
  });

  it('creates durable participant locks before quarantining a new source', async () => {
    const acquired = await acquireTeamMerge(input);

    expect(acquired).toMatchObject({
      kind: 'acquired',
      attempt: {
        auditId: attempt.auditId,
        sourceTeamId: sourceTeam.id,
        targetTeamId: targetTeam.id,
      },
    });
    expect(
      mocks.tx.team_identity_merge_participants.createMany,
    ).toHaveBeenCalledWith({
      data: [
        { mergeId: attempt.auditId, teamId: sourceTeam.id },
        { mergeId: attempt.auditId, teamId: targetTeam.id },
      ],
    });
    expect(mocks.tx.dictionaries.update).toHaveBeenCalledWith({
      where: { id: sourceTeam.id },
      data: { status: 2, updatedBy: input.operator },
    });
  });

  it('rejects a new merge when either participant is durably locked', async () => {
    mocks.tx.team_identity_merge_participants.findFirst.mockResolvedValue({
      teamId: targetTeam.id,
    });

    await expect(acquireTeamMerge(input)).rejects.toMatchObject({
      code: 'TEAM_MERGE_PARTICIPANT_CONFLICT',
    });
    expect(mocks.tx.team_identity_merges.create).not.toHaveBeenCalled();
  });

  it('rejects a retry while the current execution lease is valid', async () => {
    mocks.tx.team_identity_merges.findUnique.mockResolvedValue(
      existingMerge({
        attemptToken: 'attempt-current',
        leaseUntil: new Date(Date.now() + 60_000),
        status: 'RUNNING',
      }) as never,
    );

    await expect(acquireTeamMerge(input)).rejects.toMatchObject({
      code: 'TEAM_MERGE_RUNNING',
    });
    expect(mocks.tx.team_identity_merges.updateMany).not.toHaveBeenCalled();
  });

  it('claims an expired lease with a CAS over the previous attempt', async () => {
    const expiredLease = new Date(Date.now() - 60_000);
    mocks.tx.dictionaries.findMany.mockResolvedValue([
      { ...sourceTeam, status: 2 },
      targetTeam,
    ]);
    mocks.tx.team_identity_merges.findUnique.mockResolvedValue(
      existingMerge({
        attemptToken: 'attempt-expired',
        leaseUntil: expiredLease,
        status: 'RUNNING',
      }) as never,
    );
    mocks.tx.team_identity_merge_participants.findMany.mockResolvedValue([
      { mergeId: attempt.auditId, teamId: sourceTeam.id },
      { mergeId: attempt.auditId, teamId: targetTeam.id },
    ]);

    await expect(acquireTeamMerge(input)).resolves.toMatchObject({
      kind: 'acquired',
    });
    expect(mocks.tx.team_identity_merges.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          attemptToken: 'attempt-expired',
          id: attempt.auditId,
          leaseUntil: expiredLease,
          status: 'RUNNING',
        },
      }),
    );
  });

  it('adds retry progress to previously committed reference counts', async () => {
    mocks.tx.team_identity_merges.findUnique.mockResolvedValue({
      referenceCounts: {
        inspections: 3,
        welders: 2,
      },
    });

    await expect(
      addReferenceCounts(mocks.tx as never, attempt, {
        inspections: 4,
        workOrderRequirements: 5,
      }),
    ).resolves.toMatchObject({
      inspections: 7,
      welders: 2,
      workOrderRequirements: 5,
    });
    expect(mocks.tx.team_identity_merges.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          referenceCounts: expect.objectContaining({ inspections: 7 }),
        },
      }),
    );
  });

  it('uses the attempt token when persisting failures and lease renewal', async () => {
    await markMergeAttemptFailed(attempt, new Error('failed'));

    expect(mocks.tx.team_identity_merges.updateMany).toHaveBeenCalledWith({
      where: {
        attemptToken: attempt.attemptToken,
        id: attempt.auditId,
        status: 'RUNNING',
      },
      data: expect.objectContaining({
        attemptToken: null,
        failureCount: { increment: 1 },
        status: 'FAILED',
      }),
    });

    mocks.tx.team_identity_merges.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    await expect(
      renewMergeLease(mocks.tx as never, attempt),
    ).rejects.toMatchObject({ code: 'TEAM_MERGE_LEASE_LOST' });
  });
});
