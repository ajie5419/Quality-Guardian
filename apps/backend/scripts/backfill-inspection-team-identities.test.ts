import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { backfillInspectionTeamIdentities } from './backfill-inspection-team-identities';
import { persistResolutionAudit } from './supplier-identity-backfill-runtime';

vi.mock('~/utils/prisma', () => ({
  default: {
    inspections: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('./supplier-identity-backfill-runtime', () => ({
  persistResolutionAudit: vi.fn(),
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: vi.fn().mockReturnValue({ info: vi.fn() }),
}));

const options = {
  batchSize: 100,
  maxBatches: 0,
  mode: 'apply' as const,
};

describe('inspection TEAM identity backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('backfills an internal TEAM without requiring a supplier link', async () => {
    vi.mocked(prisma.inspections.findMany)
      .mockResolvedValueOnce([
        {
          id: 'inspection-1',
          serialNumber: 'IN-1',
          team: 'Internal Team',
          teamId: null,
        },
      ] as never)
      .mockResolvedValueOnce([]);
    vi.mocked(prisma.$transaction).mockResolvedValue([{ count: 1 }] as never);

    await expect(
      backfillInspectionTeamIdentities(options, {
        teamById: new Map(),
        teamByName: new Map([
          ['Internal Team', { id: 'team-1', name: 'Internal Team' }],
        ]),
      }),
    ).resolves.toMatchObject({ updated: 1, unresolved: 0 });
    expect(prisma.inspections.updateMany).toHaveBeenCalledWith({
      where: { id: 'inspection-1', isDeleted: false, teamId: null },
      data: { team: 'Internal Team', teamId: 'team-1' },
    });
    expect(persistResolutionAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'inspections',
        fieldName: 'teamId',
      }),
    );
  });

  it('audits a conflicting canonical ID and name without overwriting it', async () => {
    vi.mocked(prisma.inspections.findMany)
      .mockResolvedValueOnce([
        {
          id: 'inspection-2',
          serialNumber: 'IN-2',
          team: 'Team B',
          teamId: 'team-1',
        },
      ] as never)
      .mockResolvedValueOnce([]);

    await expect(
      backfillInspectionTeamIdentities(options, {
        teamById: new Map([
          ['team-1', { id: 'team-1', name: 'Team A' }],
          ['team-2', { id: 'team-2', name: 'Team B' }],
        ]),
        teamByName: new Map([['Team B', { id: 'team-2', name: 'Team B' }]]),
      }),
    ).resolves.toMatchObject({ updated: 0, unresolved: 1 });
    expect(prisma.inspections.updateMany).not.toHaveBeenCalled();
    expect(persistResolutionAudit).toHaveBeenCalledWith({
      entityType: 'inspections',
      fieldName: 'teamId',
      resolved: [],
      unresolved: [
        expect.objectContaining({ reason: 'team_identity_conflict' }),
      ],
    });
  });
});
