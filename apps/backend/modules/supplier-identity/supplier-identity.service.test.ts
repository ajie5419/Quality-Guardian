import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { SupplierIdentityService } from './supplier-identity.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    dictionaries: { findFirst: vi.fn() },
    supplier_identity_links: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    suppliers: { findFirst: vi.fn() },
  },
}));

describe('supplier identity service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });
});
