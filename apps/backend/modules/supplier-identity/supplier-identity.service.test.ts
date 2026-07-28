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
      upsert: vi.fn(),
    },
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

    await expect(
      SupplierIdentityService.listTeamOptions('Team'),
    ).resolves.toEqual([
      { group: 'internal', label: 'Internal Team', value: 'team-1' },
      { group: 'external', label: 'Resident Team', value: 'team-2' },
    ]);
  });
});
