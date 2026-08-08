import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { backfillInspectionRequestTeamIdentities } from './backfill-inspection-request-team-identities';
import { persistResolutionAudit } from './supplier-identity-backfill-runtime';

vi.mock('~/utils/prisma', () => ({
  default: {
    qms_inspection_requests: {
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

describe('inspection request TEAM identity backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('backfills a unique canonical TEAM identity without changing the snapshot', async () => {
    vi.mocked(prisma.qms_inspection_requests.findMany)
      .mockResolvedValueOnce([
        {
          id: 'request-1',
          requestNo: 'IR-1',
          team: 'Team A',
          teamId: null,
        },
      ] as never)
      .mockResolvedValueOnce([]);
    vi.mocked(prisma.qms_inspection_requests.updateMany).mockResolvedValue({
      count: 1,
    });
    vi.mocked(prisma.$transaction).mockResolvedValue([{ count: 1 }] as never);

    await expect(
      backfillInspectionRequestTeamIdentities(options, {
        teamById: new Map(),
        teamByName: new Map([['Team A', { id: 'team-1', name: 'Team A' }]]),
      }),
    ).resolves.toMatchObject({ updated: 1, unresolved: 0 });
    expect(prisma.qms_inspection_requests.updateMany).toHaveBeenCalledWith({
      where: { id: 'request-1', isDeleted: false, teamId: null },
      data: { teamId: 'team-1' },
    });
    expect(persistResolutionAudit).toHaveBeenCalledWith(
      expect.objectContaining({ fieldName: 'teamId' }),
    );
  });

  it('preserves a valid existing TEAM ID when the name conflicts', async () => {
    vi.mocked(prisma.qms_inspection_requests.findMany)
      .mockResolvedValueOnce([
        {
          id: 'request-2',
          requestNo: 'IR-2',
          team: 'Team B',
          teamId: 'team-1',
        },
      ] as never)
      .mockResolvedValueOnce([]);

    await expect(
      backfillInspectionRequestTeamIdentities(options, {
        teamById: new Map([
          ['team-1', { id: 'team-1', name: 'Team A' }],
          ['team-2', { id: 'team-2', name: 'Team B' }],
        ]),
        teamByName: new Map([['Team B', { id: 'team-2', name: 'Team B' }]]),
      }),
    ).resolves.toMatchObject({ updated: 0, unresolved: 1 });
    expect(prisma.qms_inspection_requests.updateMany).not.toHaveBeenCalled();
    expect(persistResolutionAudit).toHaveBeenCalledWith({
      entityType: 'qms_inspection_requests',
      fieldName: 'teamId',
      resolved: [],
      unresolved: [
        expect.objectContaining({ reason: 'team_identity_conflict' }),
      ],
    });
  });

  it('clears an internal TEAM request supplier identity with a CAS update', async () => {
    vi.mocked(prisma.qms_inspection_requests.findMany)
      .mockResolvedValueOnce([
        {
          id: 'request-3',
          requestNo: 'IR-3',
          supplierId: 'supplier-1',
          team: 'Machine BU',
          teamId: 'team-internal',
        },
      ] as never)
      .mockResolvedValueOnce([]);
    vi.mocked(prisma.qms_inspection_requests.updateMany).mockResolvedValue({
      count: 1,
    });
    vi.mocked(prisma.$transaction).mockResolvedValue([{ count: 1 }] as never);

    await backfillInspectionRequestTeamIdentities(options, {
      internalTeamIds: new Set(['team-internal']),
      teamById: new Map([
        ['team-internal', { id: 'team-internal', name: 'Machine BU' }],
      ]),
      teamByName: new Map(),
    });

    expect(prisma.qms_inspection_requests.updateMany).toHaveBeenCalledWith({
      data: { supplierId: null, teamId: 'team-internal' },
      where: {
        id: 'request-3',
        isDeleted: false,
        supplierId: 'supplier-1',
        teamId: 'team-internal',
      },
    });
    expect(persistResolutionAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        cleared: [
          expect.objectContaining({
            reason: 'internal_team_supplier_fields_cleared',
          }),
        ],
        fieldName: 'supplierId',
      }),
    );
  });

  it('audits an external TEAM request without a valid explicit link', async () => {
    vi.mocked(prisma.qms_inspection_requests.findMany)
      .mockResolvedValueOnce([
        {
          id: 'request-4',
          requestNo: 'IR-4',
          supplierId: null,
          team: 'External Team',
          teamId: 'team-external',
        },
      ] as never)
      .mockResolvedValueOnce([]);

    await expect(
      backfillInspectionRequestTeamIdentities(options, {
        effectiveLinks: new Map(),
        externalTeamIds: new Set(['team-external']),
        teamById: new Map([
          ['team-external', { id: 'team-external', name: 'External Team' }],
        ]),
        teamByName: new Map(),
      }),
    ).resolves.toMatchObject({ unresolved: 1, updated: 0 });
    expect(persistResolutionAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        unresolved: [
          expect.objectContaining({ reason: 'MISSING_PROCESS_TEAM_LINK' }),
        ],
      }),
    );
  });
});
