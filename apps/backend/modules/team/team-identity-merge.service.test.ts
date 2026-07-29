import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import {
  countTeamReferences,
  migrateTeamReferenceGroup,
} from './team-identity-merge-references';
import {
  acquireTeamMerge,
  addReferenceCounts,
  markMergeAttemptFailed,
  renewMergeLease,
} from './team-identity-merge-state';
import { TeamIdentityMergeService } from './team-identity-merge.service';

const mocks = vi.hoisted(() => ({
  attempt: {
    attemptToken: 'attempt-1',
    auditId: 'merge-1',
    operator: 'admin',
    sourceName: 'Structure BU2',
    sourceTeamId: 'team-source',
    targetName: 'StructureBU2',
    targetTeamId: 'team-target',
  },
  counts: {
    inspections: 3,
    inspectionRequests: 4,
    supplierIdentityLinks: 1,
    teamAliases: 1,
    teamNameKeys: 1,
    teamSources: 1,
    welders: 2,
    workOrderRequirements: 5,
  },
  loggerError: vi.fn(),
  tx: {
    dictionaries: { updateMany: vi.fn() },
    team_identity_merge_participants: { deleteMany: vi.fn() },
    team_identity_merges: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('~/utils/prisma', () => ({
  default: { $transaction: vi.fn() },
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: () => ({ error: mocks.loggerError }),
}));

vi.mock('./team-identity-merge-references', () => ({
  countTeamReferences: vi.fn(),
  migrateTeamReferenceGroup: vi.fn(),
  TEAM_IDENTITY_REFERENCE_GROUPS: [
    'inspectionRequests',
    'inspections',
    'welders',
    'workOrderRequirements',
    'identityMetadata',
  ],
}));

vi.mock('./team-identity-merge-state', () => ({
  acquireTeamMerge: vi.fn(),
  addReferenceCounts: vi.fn(),
  markMergeAttemptFailed: vi.fn(),
  parseReferenceCounts: (value: unknown) => value,
  renewMergeLease: vi.fn(),
}));

describe('teamIdentityMergeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TEAM_IDENTITY_MAINTENANCE_MODE', '1');
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) =>
      callback(mocks.tx),
    );
    vi.mocked(acquireTeamMerge).mockResolvedValue({
      attempt: mocks.attempt,
      kind: 'acquired',
    });
    const migratedGroups = new Set<string>();
    vi.mocked(migrateTeamReferenceGroup).mockImplementation(
      async (_tx, _merge, group) => {
        if (migratedGroups.has(group)) return {};
        migratedGroups.add(group);
        if (group === 'identityMetadata') return { teamAliases: 1 };
        return { [group]: 1 };
      },
    );
    vi.mocked(countTeamReferences).mockResolvedValue(0);
    mocks.tx.dictionaries.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.team_identity_merges.findUnique.mockResolvedValue({
      referenceCounts: mocks.counts,
    });
    mocks.tx.team_identity_merges.updateMany.mockResolvedValue({ count: 1 });
  });

  it('rejects merge execution outside maintenance mode', async () => {
    vi.stubEnv('TEAM_IDENTITY_MAINTENANCE_MODE', '0');

    await expect(
      TeamIdentityMergeService.merge(
        {
          reason: 'Duplicate',
          sourceTeamId: mocks.attempt.sourceTeamId,
          targetTeamId: mocks.attempt.targetTeamId,
        },
        'admin',
      ),
    ).rejects.toMatchObject({ code: 'TEAM_MERGE_REQUIRES_MAINTENANCE' });
    expect(acquireTeamMerge).not.toHaveBeenCalled();
  });

  it('persists each reference group before completing the merge', async () => {
    await expect(
      TeamIdentityMergeService.merge(
        {
          reason: 'Confirmed duplicate',
          sourceTeamId: mocks.attempt.sourceTeamId,
          targetTeamId: mocks.attempt.targetTeamId,
        },
        'admin',
      ),
    ).resolves.toEqual({
      auditId: 'merge-1',
      counts: mocks.counts,
      targetTeamId: mocks.attempt.targetTeamId,
    });

    expect(migrateTeamReferenceGroup).toHaveBeenCalledTimes(9);
    expect(addReferenceCounts).toHaveBeenCalledTimes(9);
    expect(renewMergeLease).toHaveBeenCalledTimes(10);
    expect(countTeamReferences).toHaveBeenCalledWith(
      mocks.tx,
      mocks.attempt.sourceTeamId,
    );
    expect(
      mocks.tx.team_identity_merge_participants.deleteMany,
    ).toHaveBeenCalledWith({ where: { mergeId: mocks.attempt.auditId } });
  });

  it('returns a completed merge without running migration groups', async () => {
    vi.mocked(acquireTeamMerge).mockResolvedValue({
      kind: 'completed',
      result: {
        auditId: 'merge-1',
        counts: mocks.counts,
        targetTeamId: mocks.attempt.targetTeamId,
      },
    });

    await expect(
      TeamIdentityMergeService.merge(
        {
          reason: 'Retry',
          sourceTeamId: mocks.attempt.sourceTeamId,
          targetTeamId: mocks.attempt.targetTeamId,
        },
        'admin',
      ),
    ).resolves.toMatchObject({ auditId: 'merge-1' });
    expect(migrateTeamReferenceGroup).not.toHaveBeenCalled();
  });

  it('marks only the active attempt failed when a group aborts', async () => {
    const failure = new Error('migration failed');
    vi.mocked(migrateTeamReferenceGroup).mockRejectedValueOnce(failure);

    await expect(
      TeamIdentityMergeService.merge(
        {
          reason: 'Duplicate',
          sourceTeamId: mocks.attempt.sourceTeamId,
          targetTeamId: mocks.attempt.targetTeamId,
        },
        'admin',
      ),
    ).rejects.toThrow('migration failed');

    expect(markMergeAttemptFailed).toHaveBeenCalledWith(mocks.attempt, failure);
  });
});
