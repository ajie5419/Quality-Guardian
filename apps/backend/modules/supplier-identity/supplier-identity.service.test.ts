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
      supplier: { id: 'supplier-1', isDeleted: false, name: 'Supplier A' },
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

  it('falls back to supplier master by exact TEAM name when no link exists', async () => {
    vi.mocked(prisma.supplier_identity_links.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.dictionaries.findFirst).mockResolvedValue({
      dictKey: '秦皇岛吉兴机械制造有限公司',
      id: 'team-1',
    } as never);
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([
      {
        category: 'Outsourcing',
        id: 'supplier-1',
        name: '秦皇岛吉兴机械制造有限公司',
      },
    ] as never);

    await expect(
      SupplierIdentityService.resolveSupplierByTeamId('team-1'),
    ).resolves.toEqual({
      id: 'supplier-1',
      name: '秦皇岛吉兴机械制造有限公司',
    });
    expect(prisma.suppliers.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          name: { in: ['秦皇岛吉兴机械制造有限公司'] },
        }),
      }),
    );
  });

  it('prefers Outsourcing suppliers over other categories in name fallback', async () => {
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
    ).resolves.toEqual({ id: 'supplier-outsourcing', name: 'Supplier A' });
  });

  it('uses the supplied transaction client for TEAM resolution', async () => {
    const client = {
      supplier_identity_links: { findFirst: vi.fn() },
    };
    client.supplier_identity_links.findFirst.mockResolvedValue({
      id: 'link-1',
      supplier: { id: 'supplier-1', isDeleted: false, name: 'Supplier A' },
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
        supplier: { id: 'supplier-1', isDeleted: false, name: 'Supplier A' },
      },
      {
        identityId: 'team-2',
        supplier: { id: 'supplier-2', isDeleted: false, name: 'Supplier B' },
      },
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

  it('resolves unlinked TEAMs through the supplier master by exact name', async () => {
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue([]);
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: '秦皇岛祥腾机械制造有限公司', id: 'team-1' },
      { dictKey: '发运科', id: 'team-2' },
    ] as never);
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([
      {
        category: 'Outsourcing',
        id: 'supplier-1',
        name: '秦皇岛祥腾机械制造有限公司',
      },
    ] as never);

    await expect(
      SupplierIdentityService.resolveSuppliersByTeamIds(['team-1', 'team-2']),
    ).resolves.toEqual(
      new Map([
        ['team-1', { id: 'supplier-1', name: '秦皇岛祥腾机械制造有限公司' }],
      ]),
    );
    expect(prisma.dictionaries.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['team-1', 'team-2'] },
          isDeleted: false,
          status: 1,
        }),
      }),
    );
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

  it('rejects a supplier ID that conflicts with the TEAM mapping', async () => {
    vi.mocked(prisma.suppliers.findFirst).mockResolvedValue({
      id: 'supplier-1',
      name: 'Supplier A',
    } as never);
    vi.mocked(prisma.supplier_identity_links.findFirst).mockResolvedValue({
      id: 'link-1',
      supplier: { id: 'supplier-2', isDeleted: false, name: 'Supplier B' },
    } as never);

    await expect(
      SupplierIdentityService.resolveSupplierForInspection({
        category: 'PROCESS',
        supplierId: 'supplier-1',
        teamId: 'team-1',
      }),
    ).rejects.toMatchObject({ code: 'SUPPLIER_IDENTITY_MISMATCH' });
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
      id: 'supplier-2',
      name: 'Supplier B',
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
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue([
      { identityId: 'team-1', supplierId: 'supplier-1' },
      { identityId: 'team-2', supplierId: 'supplier-1' },
      { identityId: 'team-3', supplierId: 'supplier-2' },
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

  it('returns canonical TEAM IDs and classifies linked external teams', async () => {
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: 'Internal Team', id: 'team-1' },
      { dictKey: 'Resident Team', id: 'team-2' },
    ] as never);
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue([
      { identityId: 'team-2' },
    ] as never);
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([]);

    await expect(
      SupplierIdentityService.listTeamOptions('Team'),
    ).resolves.toEqual([
      { group: 'internal', label: 'Internal Team', value: 'team-1' },
      { group: 'external', label: 'Resident Team', value: 'team-2' },
    ]);
  });

  it('returns all active management option types without supplier category filters', async () => {
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: 'Assembly TEAM', id: 'team-1' },
    ] as never);
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([
      { id: 'supplier-1', name: 'Supplier A' },
      { id: 'supplier-2', name: 'Outsourcing B' },
    ] as never);

    await expect(
      SupplierIdentityService.listManagementOptions({
        keyword: 'A',
        take: 100,
      }),
    ).resolves.toEqual({
      suppliers: [
        { label: 'Supplier A', value: 'supplier-1' },
        { label: 'Outsourcing B', value: 'supplier-2' },
      ],
      teams: [{ label: 'Assembly TEAM', value: 'team-1' }],
    });
    expect(prisma.suppliers.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
      take: 100,
      where: { isDeleted: false, name: { contains: 'A' } },
    });
    expect(prisma.dictionaries.findMany).toHaveBeenCalledWith({
      orderBy: [{ sort: 'asc' }, { dictKey: 'asc' }],
      select: { dictKey: true, id: true },
      take: 100,
      where: {
        dictKey: { contains: 'A' },
        dictType: 'team',
        isDeleted: false,
        status: 1,
      },
    });
  });

  it('classifies unlinked TEAMs as external when the supplier master matches by name', async () => {
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
        group: 'external',
        label: '秦皇岛吉兴机械制造有限公司',
        value: 'team-1',
      },
      { group: 'internal', label: '组装 BU', value: 'team-2' },
    ]);
  });
});
