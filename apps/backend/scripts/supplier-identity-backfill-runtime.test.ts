import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import {
  assertBackfillIntegrity,
  bootstrapExactTeamLinks,
} from './supplier-identity-backfill-runtime';

vi.mock('~/utils/prisma', () => ({
  default: {
    dictionaries: { findMany: vi.fn() },
    supplier_identity_links: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    suppliers: { findMany: vi.fn() },
    unresolved_master_data_refs: {
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe('supplier identity backfill runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects non-zero integrity metrics with actionable details', () => {
    expect(() =>
      assertBackfillIntegrity([
        { name: 'team-links', conflicts: 1 },
        { name: 'inspections', unresolved: 2 },
      ]),
    ).toThrow(
      'Supplier identity backfill integrity check failed: team-links.conflicts=1, inspections.unresolved=2',
    );
  });

  it('accepts a clean backfill summary', () => {
    expect(() =>
      assertBackfillIntegrity([
        {
          ambiguous: 0,
          concurrentChanges: 0,
          conflicts: 0,
          name: 'inspections',
          unresolved: 0,
        },
      ]),
    ).not.toThrow();
  });

  it('persists exact TEAM mapping conflicts for later resolution', async () => {
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([
      {
        category: 'Outsourcing',
        id: 'supplier-expected',
        name: 'Resident Team',
        outsourcingMode: 'IN_HOUSE_TEAM',
      },
    ] as never);
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: 'Resident Team', id: 'team-1' },
    ] as never);
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue([
      {
        identityId: 'team-1',
        isDeleted: false,
        supplier: {
          id: 'supplier-linked',
          isDeleted: false,
          name: 'Other Supplier',
        },
        supplierId: 'supplier-linked',
      },
    ] as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);

    await expect(bootstrapExactTeamLinks('apply')).resolves.toMatchObject({
      conflicts: 1,
    });
    expect(prisma.unresolved_master_data_refs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          entityId: 'team-1',
          entityType: 'supplier_identity_links',
          reason: 'team_supplier_identity_conflict',
        }),
      }),
    );
  });
});
