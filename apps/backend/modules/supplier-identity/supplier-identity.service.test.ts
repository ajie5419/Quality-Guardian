import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { SupplierIdentityService } from './supplier-identity.service';

const { isPrismaUniqueConstraintError } = vi.hoisted(() => ({
  isPrismaUniqueConstraintError: vi.fn(),
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    $queryRaw: vi.fn(),
    dictionaries: { findFirst: vi.fn(), findMany: vi.fn() },
    inspections: { count: vi.fn() },
    metric_refresh_jobs: { createMany: vi.fn() },
    qms_inspection_requests: { count: vi.fn() },
    supplier_identity_links: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    team_identity_merge_participants: { findUnique: vi.fn() },
    team_identity_sources: { findFirst: vi.fn(), findMany: vi.fn() },
    suppliers: { findFirst: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaUniqueConstraintError,
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: vi.fn().mockReturnValue({ error: vi.fn() }),
}));

describe('supplier identity service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation((callback) =>
      callback(prisma as never),
    );
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    vi.mocked(
      prisma.team_identity_merge_participants.findUnique,
    ).mockResolvedValue(null);
  });

  it('resolves a supplier through an active TEAM link', async () => {
    vi.mocked(prisma.supplier_identity_links.findFirst).mockResolvedValue({
      id: 'link-1',
      supplier: {
        category: 'Outsourcing',
        id: 'supplier-1',
        isDeleted: false,
        name: 'Supplier A',
        outsourcingMode: 'IN_HOUSE_TEAM',
      },
    } as never);
    vi.mocked(prisma.team_identity_sources.findFirst).mockResolvedValue({
      id: 'source-1',
    } as never);

    await expect(
      SupplierIdentityService.resolveSupplierByTeamId('team-1'),
    ).resolves.toEqual({ id: 'supplier-1', name: 'Supplier A' });
    expect(prisma.supplier_identity_links.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ identityId: 'team-1' }),
      }),
    );
  });

  it('returns unresolved when no explicit TEAM link exists', async () => {
    vi.mocked(prisma.supplier_identity_links.findFirst).mockResolvedValue(null);
    await expect(
      SupplierIdentityService.resolveSupplierByTeamId('team-1'),
    ).resolves.toBeNull();
    expect(prisma.suppliers.findMany).not.toHaveBeenCalled();
  });

  it('does not resolve an unlinked TEAM even when a supplier has the same name', async () => {
    vi.mocked(prisma.supplier_identity_links.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.dictionaries.findFirst).mockResolvedValue({
      dictKey: 'Supplier A',
      id: 'team-1',
    } as never);
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([
      { category: 'Supplier', id: 'supplier-supplier', name: 'Supplier A' },
      {
        category: 'Outsourcing',
        id: 'supplier-outsourcing',
        name: 'Supplier A',
      },
    ] as never);

    await expect(
      SupplierIdentityService.resolveSupplierByTeamId('team-1'),
    ).resolves.toBeNull();
  });

  it('uses the supplied transaction client for TEAM resolution', async () => {
    const client = {
      supplier_identity_links: { findFirst: vi.fn() },
      team_identity_sources: { findFirst: vi.fn() },
    };
    client.supplier_identity_links.findFirst.mockResolvedValue({
      id: 'link-1',
      supplier: {
        category: 'Outsourcing',
        id: 'supplier-1',
        isDeleted: false,
        name: 'Supplier A',
        outsourcingMode: 'EXTERNAL_SERVICE',
      },
    });
    client.team_identity_sources.findFirst.mockResolvedValue({
      id: 'source-1',
    });

    await SupplierIdentityService.resolveSupplierByTeamId(
      'team-1',
      client as never,
    );

    expect(client.supplier_identity_links.findFirst).toHaveBeenCalledOnce();
    expect(prisma.supplier_identity_links.findFirst).not.toHaveBeenCalled();
  });

  it('resolves suppliers for TEAM IDs in one query', async () => {
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue([
      {
        identityId: 'team-1',
        supplier: {
          category: 'Outsourcing',
          id: 'supplier-1',
          isDeleted: false,
          name: 'Supplier A',
          outsourcingMode: 'IN_HOUSE_TEAM',
        },
        supplierId: 'supplier-1',
      },
      {
        identityId: 'team-2',
        supplier: {
          category: 'Outsourcing',
          id: 'supplier-2',
          isDeleted: false,
          name: 'Supplier B',
          outsourcingMode: 'EXTERNAL_SERVICE',
        },
        supplierId: 'supplier-2',
      },
    ] as never);
    vi.mocked(prisma.team_identity_sources.findMany).mockResolvedValue([
      { sourceId: 'supplier-1', teamId: 'team-1' },
      { sourceId: 'supplier-2', teamId: 'team-2' },
    ] as never);

    await expect(
      SupplierIdentityService.resolveSuppliersByTeamIds([
        'team-1',
        'team-1',
        'team-2',
        null,
      ]),
    ).resolves.toEqual(
      new Map([
        ['team-1', { id: 'supplier-1', name: 'Supplier A' }],
        ['team-2', { id: 'supplier-2', name: 'Supplier B' }],
      ]),
    );
    expect(prisma.supplier_identity_links.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          identityId: { in: ['team-1', 'team-2'] },
        }),
      }),
    );
  });

  it('does not resolve unlinked TEAMs through supplier names', async () => {
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue([]);
    await expect(
      SupplierIdentityService.resolveSuppliersByTeamIds(['team-1', 'team-2']),
    ).resolves.toEqual(new Map());
    expect(prisma.dictionaries.findMany).not.toHaveBeenCalled();
  });

  it('excludes batch links without an exact SUPPLIER source', async () => {
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue([
      {
        identityId: 'team-1',
        supplier: {
          category: 'Outsourcing',
          id: 'supplier-1',
          isDeleted: false,
          name: 'Supplier A',
          outsourcingMode: 'IN_HOUSE_TEAM',
        },
        supplierId: 'supplier-1',
      },
    ] as never);
    vi.mocked(prisma.team_identity_sources.findMany).mockResolvedValue([]);

    await expect(
      SupplierIdentityService.resolveSuppliersByTeamIds(['team-1']),
    ).resolves.toEqual(new Map());
  });

  it('resolves canonical supplier names by unique IDs in one query', async () => {
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([
      { id: 'supplier-1', name: 'Supplier A' },
      { id: 'supplier-2', name: 'Supplier B' },
    ] as never);

    await expect(
      SupplierIdentityService.resolveNamesByIds([
        'supplier-1',
        'supplier-1',
        'supplier-2',
        null,
      ]),
    ).resolves.toEqual(
      new Map([
        ['supplier-1', 'Supplier A'],
        ['supplier-2', 'Supplier B'],
      ]),
    );
    expect(prisma.suppliers.findMany).toHaveBeenCalledWith({
      select: { id: true, name: true },
      where: {
        id: { in: ['supplier-1', 'supplier-2'] },
        isDeleted: false,
      },
    });
  });

  it('rejects retiring a TEAM while an active supplier link exists', async () => {
    vi.mocked(prisma.supplier_identity_links.findFirst).mockResolvedValue({
      id: 'link-1',
    } as never);

    await expect(
      SupplierIdentityService.assertTeamCanBeRetired('team-1'),
    ).rejects.toMatchObject({
      code: 'TEAM_IDENTITY_LINK_ACTIVE',
      httpStatus: 409,
    });
  });

  it('allows retiring a TEAM after its supplier link is removed', async () => {
    vi.mocked(prisma.supplier_identity_links.findFirst).mockResolvedValue(null);

    await expect(
      SupplierIdentityService.assertTeamCanBeRetired('team-1'),
    ).resolves.toBeUndefined();
  });

  it('ignores a caller supplier ID for process inspections', async () => {
    vi.mocked(prisma.suppliers.findFirst).mockResolvedValue({
      id: 'supplier-1',
      name: 'Supplier A',
    } as never);
    vi.mocked(prisma.supplier_identity_links.findFirst).mockResolvedValue({
      id: 'link-1',
      supplier: {
        category: 'Outsourcing',
        id: 'supplier-2',
        isDeleted: false,
        name: 'Supplier B',
        outsourcingMode: 'IN_HOUSE_TEAM',
      },
    } as never);
    vi.mocked(prisma.team_identity_sources.findFirst).mockResolvedValue({
      id: 'source-1',
    } as never);

    await expect(
      SupplierIdentityService.resolveSupplierForInspection({
        category: 'PROCESS',
        supplierId: 'supplier-1',
        teamId: 'team-1',
      }),
    ).resolves.toEqual({ id: 'supplier-2', name: 'Supplier B' });
  });

  it('does not accept a caller supplier ID when an unlinked TEAM is unresolved', async () => {
    vi.mocked(prisma.supplier_identity_links.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.team_identity_sources.findFirst).mockResolvedValue(null);

    await expect(
      SupplierIdentityService.resolveSupplierForInspection({
        category: 'PROCESS',
        supplierId: 'supplier-1',
        teamId: 'team-1',
      }),
    ).resolves.toBeNull();
    expect(prisma.suppliers.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a link whose supplier source belongs to another TEAM', async () => {
    vi.mocked(prisma.supplier_identity_links.findFirst).mockResolvedValue({
      id: 'link-1',
      supplier: {
        category: 'Outsourcing',
        id: 'supplier-1',
        isDeleted: false,
        name: 'Supplier A',
        outsourcingMode: 'IN_HOUSE_TEAM',
      },
    } as never);
    vi.mocked(prisma.team_identity_sources.findFirst).mockResolvedValue(null);

    await expect(
      SupplierIdentityService.resolveSupplierByTeamId('team-1'),
    ).resolves.toBeNull();
  });

  it('blocks an external TEAM without a valid supplier link', async () => {
    vi.mocked(prisma.supplier_identity_links.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.team_identity_sources.findFirst).mockResolvedValue({
      id: 'source-1',
    } as never);

    await expect(
      SupplierIdentityService.resolveSupplierForInspection({
        category: 'PROCESS',
        teamId: 'team-external',
      }),
    ).rejects.toMatchObject({ code: 'MISSING_PROCESS_TEAM_LINK' });
  });

  it('does not create a link for a non-TEAM dictionary ID', async () => {
    vi.mocked(prisma.suppliers.findFirst).mockResolvedValue({
      id: 'supplier-1',
      name: 'Supplier A',
    } as never);
    vi.mocked(prisma.dictionaries.findFirst).mockResolvedValue(null);

    await expect(
      SupplierIdentityService.create({
        supplierId: 'supplier-1',
        teamId: 'wrong-dictionary-id',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TEAM_ID' });
    expect(prisma.supplier_identity_links.upsert).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite an active TEAM link owned by another supplier', async () => {
    vi.mocked(prisma.suppliers.findFirst).mockResolvedValue({
      category: 'Outsourcing',
      id: 'supplier-2',
      name: 'Supplier B',
      outsourcingMode: 'IN_HOUSE_TEAM',
    } as never);
    vi.mocked(prisma.team_identity_sources.findFirst).mockResolvedValue({
      id: 'source-1',
    } as never);
    vi.mocked(prisma.dictionaries.findFirst).mockResolvedValue({
      dictKey: 'Team A',
      id: 'team-1',
    } as never);
    vi.mocked(prisma.supplier_identity_links.findUnique).mockResolvedValue({
      id: 'link-1',
      isDeleted: false,
      supplierId: 'supplier-1',
    } as never);

    await expect(
      SupplierIdentityService.create({
        supplierId: 'supplier-2',
        teamId: 'team-1',
      }),
    ).rejects.toMatchObject({ code: 'TEAM_IDENTITY_CONFLICT' });
    expect(prisma.supplier_identity_links.update).not.toHaveBeenCalled();
  });

  it('blocks restoring a deleted TEAM link to a different supplier with PROCESS facts', async () => {
    vi.mocked(prisma.suppliers.findFirst).mockResolvedValue({
      category: 'Outsourcing',
      id: 'supplier-2',
      name: 'Supplier B',
      outsourcingMode: 'IN_HOUSE_TEAM',
    } as never);
    vi.mocked(prisma.team_identity_sources.findFirst).mockResolvedValue({
      id: 'source-1',
    } as never);
    vi.mocked(prisma.dictionaries.findFirst).mockResolvedValue({
      dictKey: 'Team A',
      id: 'team-1',
    } as never);
    vi.mocked(prisma.supplier_identity_links.findUnique).mockResolvedValue({
      id: 'link-1',
      isDeleted: true,
      supplierId: 'supplier-1',
    } as never);
    vi.mocked(prisma.inspections.count).mockResolvedValue(1);
    vi.mocked(prisma.qms_inspection_requests.count).mockResolvedValue(0);

    await expect(
      SupplierIdentityService.create({
        supplierId: 'supplier-2',
        teamId: 'team-1',
      }),
    ).rejects.toMatchObject({ code: 'TEAM_IDENTITY_FACTS_EXIST' });
    expect(prisma.supplier_identity_links.update).not.toHaveBeenCalled();
  });

  it('allows restoring a deleted TEAM link for its original supplier', async () => {
    vi.mocked(prisma.suppliers.findFirst).mockResolvedValue({
      category: 'Outsourcing',
      id: 'supplier-1',
      name: 'Supplier A',
      outsourcingMode: 'IN_HOUSE_TEAM',
    } as never);
    vi.mocked(prisma.team_identity_sources.findFirst).mockResolvedValue({
      id: 'source-1',
    } as never);
    vi.mocked(prisma.dictionaries.findFirst).mockResolvedValue({
      dictKey: 'Team A',
      id: 'team-1',
    } as never);
    vi.mocked(prisma.supplier_identity_links.findUnique).mockResolvedValue({
      id: 'link-1',
      isDeleted: true,
      supplierId: 'supplier-1',
    } as never);
    vi.mocked(prisma.supplier_identity_links.update).mockResolvedValue({
      id: 'link-1',
    } as never);
    vi.mocked(prisma.metric_refresh_jobs.createMany).mockResolvedValue({
      count: 1,
    } as never);

    await expect(
      SupplierIdentityService.create({
        supplierId: 'supplier-1',
        teamId: 'team-1',
      }),
    ).resolves.toEqual({ id: 'link-1' });
    expect(prisma.inspections.count).not.toHaveBeenCalled();
    expect(prisma.qms_inspection_requests.count).not.toHaveBeenCalled();
  });

  it('blocks supplier link mutations while TEAM participates in a merge', async () => {
    vi.mocked(
      prisma.team_identity_merge_participants.findUnique,
    ).mockResolvedValue({ mergeId: 'merge-1' } as never);

    await expect(
      SupplierIdentityService.create({
        supplierId: 'supplier-1',
        teamId: 'team-1',
      }),
    ).rejects.toMatchObject({ code: 'TEAM_MERGE_PARTICIPANT_LOCKED' });
    expect(prisma.dictionaries.findFirst).not.toHaveBeenCalled();
  });

  it('blocks deleting a link while process facts still reference its TEAM', async () => {
    vi.mocked(prisma.supplier_identity_links.findFirst).mockResolvedValue({
      id: 'link-1',
      identityId: 'team-1',
      supplierId: 'supplier-1',
    } as never);
    vi.mocked(prisma.inspections.count).mockResolvedValue(1);
    vi.mocked(prisma.qms_inspection_requests.count).mockResolvedValue(0);

    await expect(
      SupplierIdentityService.delete('link-1'),
    ).rejects.toMatchObject({
      code: 'TEAM_IDENTITY_FACTS_EXIST',
    });
    expect(prisma.supplier_identity_links.updateMany).not.toHaveBeenCalled();
  });

  it('normalizes a concurrent unique-key race to a TEAM conflict', async () => {
    vi.mocked(prisma.suppliers.findFirst).mockResolvedValue({
      id: 'supplier-1',
      name: 'Supplier A',
    } as never);
    vi.mocked(prisma.dictionaries.findFirst).mockResolvedValue({
      dictKey: 'Team A',
      id: 'team-1',
    } as never);
    vi.mocked(prisma.supplier_identity_links.findUnique).mockResolvedValue(
      null,
    );
    const conflict = new Error('unique constraint');
    vi.mocked(prisma.supplier_identity_links.create).mockRejectedValue(
      conflict,
    );
    isPrismaUniqueConstraintError.mockReturnValue(true);

    await expect(
      SupplierIdentityService.create({
        supplierId: 'supplier-1',
        teamId: 'team-1',
      }),
    ).rejects.toMatchObject({ code: 'TEAM_IDENTITY_CONFLICT' });
  });

  it('loads TEAM identities for suppliers in one query', async () => {
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([
      { id: 'supplier-1' },
      { id: 'supplier-2' },
    ] as never);
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue([
      { identityId: 'team-1', supplierId: 'supplier-1' },
      { identityId: 'team-2', supplierId: 'supplier-1' },
      { identityId: 'team-3', supplierId: 'supplier-2' },
    ] as never);
    vi.mocked(prisma.team_identity_sources.findMany).mockResolvedValue([
      { sourceId: 'supplier-1', teamId: 'team-1' },
      { sourceId: 'supplier-1', teamId: 'team-2' },
      { sourceId: 'supplier-2', teamId: 'team-3' },
    ] as never);
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { id: 'team-1' },
      { id: 'team-2' },
      { id: 'team-3' },
    ] as never);

    await expect(
      SupplierIdentityService.teamIdsBySupplierIds([
        'supplier-1',
        'supplier-1',
        'supplier-2',
      ]),
    ).resolves.toEqual(
      new Map([
        ['supplier-1', ['team-1', 'team-2']],
        ['supplier-2', ['team-3']],
      ]),
    );
    expect(prisma.supplier_identity_links.findMany).toHaveBeenCalledWith({
      select: { identityId: true, supplierId: true },
      where: {
        identityType: 'TEAM',
        isDeleted: false,
        supplierId: { in: ['supplier-1', 'supplier-2'] },
      },
    });
  });

  it('excludes historical links without an active exact source, team, or PROCESS supplier policy', async () => {
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([
      { id: 'supplier-valid' },
    ] as never);
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue([
      { identityId: 'team-valid', supplierId: 'supplier-valid' },
      { identityId: 'team-no-source', supplierId: 'supplier-valid' },
      { identityId: 'team-inactive', supplierId: 'supplier-valid' },
    ] as never);
    vi.mocked(prisma.team_identity_sources.findMany).mockResolvedValue([
      { sourceId: 'supplier-valid', teamId: 'team-valid' },
      { sourceId: 'supplier-valid', teamId: 'team-inactive' },
      { sourceId: 'supplier-other', teamId: 'team-no-source' },
    ] as never);
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { id: 'team-valid' },
      { id: 'team-no-source' },
    ] as never);

    await expect(
      SupplierIdentityService.teamIdsBySupplierIds([
        'supplier-valid',
        'supplier-non-process-policy',
      ]),
    ).resolves.toEqual(new Map([['supplier-valid', ['team-valid']]]));
  });

  it('returns canonical TEAM IDs and classifies linked external teams', async () => {
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: 'Internal Team', id: 'team-1' },
      { dictKey: 'Resident Team', id: 'team-2' },
    ] as never);
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue([
      {
        identityId: 'team-2',
        supplier: {
          category: 'Outsourcing',
          id: 'supplier-1',
          isDeleted: false,
          name: 'Resident Supplier',
          outsourcingMode: 'IN_HOUSE_TEAM',
        },
        supplierId: 'supplier-1',
      },
    ] as never);
    vi.mocked(prisma.team_identity_sources.findMany).mockResolvedValue([
      { sourceId: 'supplier-1', teamId: 'team-2' },
    ] as never);

    await expect(
      SupplierIdentityService.listTeamOptions('Team'),
    ).resolves.toEqual([
      { group: 'internal', label: 'Internal Team', value: 'team-1' },
      { group: 'external', label: 'Resident Team', value: 'team-2' },
    ]);
  });

  it('returns only process-responsible supplier management options', async () => {
    vi.mocked(prisma.team_identity_sources.findMany).mockResolvedValue([
      { sourceId: 'supplier-1', teamId: 'team-1' },
      { sourceId: 'supplier-2', teamId: 'team-1' },
    ] as never);
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: 'Assembly TEAM', id: 'team-1' },
    ] as never);
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([
      {
        category: 'Supplier',
        id: 'supplier-1',
        name: 'Supplier A',
        outsourcingMode: null,
      },
      {
        category: 'Outsourcing',
        id: 'supplier-2',
        name: 'Outsourcing B',
        outsourcingMode: 'EXTERNAL_SERVICE',
      },
    ] as never);

    await expect(
      SupplierIdentityService.listManagementOptions({
        keyword: 'A',
        take: 100,
        target: 'team',
      }),
    ).resolves.toEqual({
      suppliers: [{ label: 'Outsourcing B', value: 'supplier-2' }],
      teams: [{ label: 'Assembly TEAM', value: 'team-1' }],
    });
    expect(prisma.suppliers.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
      select: { category: true, id: true, name: true, outsourcingMode: true },
      take: 100,
      where: {
        id: { in: ['supplier-1', 'supplier-2'] },
        isDeleted: false,
      },
    });
    expect(prisma.team_identity_sources.findMany).toHaveBeenCalledWith({
      select: { sourceId: true, teamId: true },
      take: 100,
      where: {
        isDeleted: false,
        sourceType: 'SUPPLIER',
        teamId: { in: ['team-1'] },
      },
    });
    expect(prisma.dictionaries.findMany).toHaveBeenCalledWith({
      orderBy: [{ sort: 'asc' }, { dictKey: 'asc' }],
      select: { dictKey: true, id: true },
      take: 100,
      where: {
        dictKey: { contains: 'A' },
        dictType: 'team',
        isDeleted: false,
        teamIdentitySources: {
          some: { isDeleted: false, sourceType: 'SUPPLIER' },
        },
        status: 1,
      },
    });
  });

  it('lists only the source-matched supplier for a selected TEAM', async () => {
    vi.mocked(prisma.team_identity_sources.findMany).mockResolvedValue([
      { sourceId: 'supplier-1', teamId: 'team-1' },
    ] as never);
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([
      {
        category: 'Outsourcing',
        id: 'supplier-1',
        name: 'Supplier A',
        outsourcingMode: 'IN_HOUSE_TEAM',
      },
    ] as never);
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: 'Resident TEAM', id: 'team-1' },
    ] as never);

    await expect(
      SupplierIdentityService.listManagementOptions({
        take: 100,
        teamId: 'team-1',
        target: 'supplier',
      }),
    ).resolves.toEqual({
      suppliers: [{ label: 'Supplier A', value: 'supplier-1' }],
      teams: [{ label: 'Resident TEAM', value: 'team-1' }],
    });
    expect(prisma.team_identity_sources.findMany).toHaveBeenCalledWith({
      select: { sourceId: true, teamId: true },
      take: 100,
      where: {
        isDeleted: false,
        sourceId: { in: ['supplier-1'] },
        sourceType: 'SUPPLIER',
        teamId: { in: ['team-1'] },
      },
    });
  });

  it('searches supplier candidates before bounded sources', async () => {
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([
      {
        category: 'Outsourcing',
        id: 'supplier-target',
        name: 'Target Supplier',
        outsourcingMode: 'EXTERNAL_SERVICE',
      },
    ] as never);
    vi.mocked(prisma.team_identity_sources.findMany).mockResolvedValue([
      { sourceId: 'supplier-target', teamId: 'team-target' },
    ] as never);
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: 'Target TEAM', id: 'team-target' },
    ] as never);

    await expect(
      SupplierIdentityService.listManagementOptions({
        keyword: 'Target',
        take: 100,
        target: 'supplier',
      }),
    ).resolves.toEqual({
      suppliers: [{ label: 'Target Supplier', value: 'supplier-target' }],
      teams: [{ label: 'Target TEAM', value: 'team-target' }],
    });
    expect(prisma.suppliers.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
      select: { category: true, id: true, name: true, outsourcingMode: true },
      take: 100,
      where: {
        category: 'Outsourcing',
        isDeleted: false,
        name: { contains: 'Target' },
        outsourcingMode: { in: ['IN_HOUSE_TEAM', 'EXTERNAL_SERVICE'] },
      },
    });
    expect(prisma.team_identity_sources.findMany).toHaveBeenCalledWith({
      select: { sourceId: true, teamId: true },
      take: 100,
      where: {
        isDeleted: false,
        sourceId: { in: ['supplier-target'] },
        sourceType: 'SUPPLIER',
      },
    });
    expect(
      vi.mocked(prisma.suppliers.findMany).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(prisma.team_identity_sources.findMany).mock
        .invocationCallOrder[0] || Number.POSITIVE_INFINITY,
    );
  });

  it('classifies an unlinked TEAM as internal even when a supplier has the same name', async () => {
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: '秦皇岛吉兴机械制造有限公司', id: 'team-1' },
      { dictKey: '组装 BU', id: 'team-2' },
    ] as never);
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue([]);
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([
      {
        category: 'Outsourcing',
        id: 'supplier-1',
        name: '秦皇岛吉兴机械制造有限公司',
      },
    ] as never);

    await expect(SupplierIdentityService.listTeamOptions('')).resolves.toEqual([
      {
        group: 'internal',
        label: '秦皇岛吉兴机械制造有限公司',
        value: 'team-1',
      },
      { group: 'internal', label: '组装 BU', value: 'team-2' },
    ]);
  });
});
