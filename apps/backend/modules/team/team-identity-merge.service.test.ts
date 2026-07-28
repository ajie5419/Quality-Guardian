import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import {
  countTeamReferences,
  migrateTeamReferences,
} from './team-identity-merge-references';
import { TeamIdentityMergeService } from './team-identity-merge.service';

const mocks = vi.hoisted(() => ({
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
    $queryRaw: vi.fn(),
    dictionaries: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    supplier_identity_links: { findMany: vi.fn() },
    team_identity_merges: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
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
  createEmptyReferenceCounts: () => ({ ...mocks.counts }),
  migrateTeamReferences: vi.fn(),
}));

const sourceTeam = {
  dictKey: 'Structure BU2',
  id: 'team-source',
  isSystem: false,
  status: 1,
};
const targetTeam = {
  dictKey: 'StructureBU2',
  id: 'team-target',
  isSystem: false,
  status: 1,
};

describe('teamIdentityMergeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TEAM_IDENTITY_MAINTENANCE_MODE', '1');
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) =>
      callback(mocks.tx),
    );
    mocks.tx.team_identity_merges.findUnique.mockResolvedValue(null);
    mocks.tx.$queryRaw.mockResolvedValue([]);
    mocks.tx.team_identity_merges.findFirst.mockResolvedValue(null);
    mocks.tx.team_identity_merges.create.mockResolvedValue({ id: 'merge-1' });
    mocks.tx.dictionaries.findMany.mockResolvedValue([sourceTeam, targetTeam]);
    mocks.tx.dictionaries.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.supplier_identity_links.findMany.mockResolvedValue([]);
    vi.mocked(migrateTeamReferences).mockResolvedValue(mocks.counts);
    vi.mocked(countTeamReferences).mockResolvedValue(0);
  });

  it('rejects merge execution outside maintenance mode', async () => {
    vi.stubEnv('TEAM_IDENTITY_MAINTENANCE_MODE', '0');

    await expect(
      TeamIdentityMergeService.merge(
        {
          reason: 'Duplicate',
          sourceTeamId: sourceTeam.id,
          targetTeamId: targetTeam.id,
        },
        'admin',
      ),
    ).rejects.toMatchObject({ code: 'TEAM_MERGE_REQUIRES_MAINTENANCE' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('migrates and retires the source in one maintenance transaction', async () => {
    await expect(
      TeamIdentityMergeService.merge(
        {
          reason: 'Confirmed duplicate',
          sourceTeamId: sourceTeam.id,
          targetTeamId: targetTeam.id,
        },
        'admin',
      ),
    ).resolves.toEqual({
      auditId: 'merge-1',
      counts: mocks.counts,
      targetTeamId: targetTeam.id,
    });

    expect(migrateTeamReferences).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        auditId: 'merge-1',
        sourceTeamId: sourceTeam.id,
        targetTeamId: targetTeam.id,
      }),
      200,
      'admin',
    );
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(countTeamReferences).toHaveBeenCalledWith(mocks.tx, sourceTeam.id);
    expect(mocks.tx.dictionaries.update).toHaveBeenCalledWith({
      where: { id: sourceTeam.id },
      data: { status: 0, updatedBy: 'admin' },
    });
    expect(mocks.tx.team_identity_merges.update).toHaveBeenCalledWith({
      where: { id: 'merge-1' },
      data: {
        completedAt: expect.any(Date),
        referenceCounts: mocks.counts,
        status: 'COMPLETED',
      },
    });
  });

  it('rejects identities linked to different active suppliers', async () => {
    mocks.tx.supplier_identity_links.findMany.mockResolvedValue([
      { identityId: sourceTeam.id, supplierId: 'supplier-1' },
      { identityId: targetTeam.id, supplierId: 'supplier-2' },
    ]);

    await expect(
      TeamIdentityMergeService.merge(
        {
          reason: 'Duplicate',
          sourceTeamId: sourceTeam.id,
          targetTeamId: targetTeam.id,
        },
        'admin',
      ),
    ).rejects.toMatchObject({ code: 'TEAM_MERGE_SUPPLIER_CONFLICT' });
    expect(migrateTeamReferences).not.toHaveBeenCalled();
  });

  it('returns a completed merge without migrating references again', async () => {
    mocks.tx.team_identity_merges.findUnique.mockResolvedValue({
      id: 'merge-1',
      referenceCounts: mocks.counts,
      status: 'COMPLETED',
      targetTeamId: targetTeam.id,
    });

    await expect(
      TeamIdentityMergeService.merge(
        {
          reason: 'Retry',
          sourceTeamId: sourceTeam.id,
          targetTeamId: targetTeam.id,
        },
        'admin',
      ),
    ).resolves.toEqual({
      auditId: 'merge-1',
      counts: mocks.counts,
      targetTeamId: targetTeam.id,
    });
    expect(migrateTeamReferences).not.toHaveBeenCalled();
  });

  it('rejects overlapping pending merge participants', async () => {
    mocks.tx.team_identity_merges.findFirst.mockResolvedValue({
      id: 'merge-other',
    });

    await expect(
      TeamIdentityMergeService.merge(
        {
          reason: 'Duplicate',
          sourceTeamId: sourceTeam.id,
          targetTeamId: targetTeam.id,
        },
        'admin',
      ),
    ).rejects.toMatchObject({ code: 'TEAM_MERGE_PARTICIPANT_CONFLICT' });
  });
});
