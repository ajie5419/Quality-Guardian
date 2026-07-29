import { beforeEach, describe, expect, it, vi } from 'vitest';

import { migrateSupplierLinks } from './team-identity-merge-supplier';

const { isPrismaUniqueConstraintError } = vi.hoisted(() => ({
  isPrismaUniqueConstraintError: vi.fn(),
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaUniqueConstraintError,
}));

const tx = {
  metric_refresh_jobs: {
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  supplier_identity_links: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
};
const merge = {
  sourceTeamId: 'team-source',
  targetName: 'StructureBU2',
  targetTeamId: 'team-target',
};

function link(
  id: string,
  identityId: string,
  supplierId: string,
  isDeleted: boolean,
) {
  return { id, identityId, isDeleted, supplierId };
}

describe('team identity merge supplier links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isPrismaUniqueConstraintError.mockReturnValue(false);
  });

  it('restores a deleted target link with the active source supplier', async () => {
    tx.supplier_identity_links.findMany.mockResolvedValue([
      link('source-link', merge.sourceTeamId, 'supplier-new', false),
      link('target-link', merge.targetTeamId, 'supplier-old', true),
    ]);

    await expect(migrateSupplierLinks(tx as never, merge)).resolves.toBe(1);
    expect(tx.supplier_identity_links.update).toHaveBeenCalledWith({
      where: { id: 'source-link' },
      data: { isDeleted: true },
    });
    expect(tx.supplier_identity_links.update).toHaveBeenCalledWith({
      where: { id: 'target-link' },
      data: {
        identityNameSnapshot: merge.targetName,
        isDeleted: false,
        supplierId: 'supplier-new',
      },
    });
  });

  it('does not let a deleted source overwrite an active target link', async () => {
    tx.supplier_identity_links.findMany.mockResolvedValue([
      link('source-link', merge.sourceTeamId, 'supplier-old', true),
      link('target-link', merge.targetTeamId, 'supplier-current', false),
    ]);

    await expect(migrateSupplierLinks(tx as never, merge)).resolves.toBe(0);
    expect(tx.supplier_identity_links.update).not.toHaveBeenCalled();
  });

  it('rejects two active links owned by different suppliers', async () => {
    tx.supplier_identity_links.findMany.mockResolvedValue([
      link('source-link', merge.sourceTeamId, 'supplier-source', false),
      link('target-link', merge.targetTeamId, 'supplier-target', false),
    ]);

    await expect(
      migrateSupplierLinks(tx as never, merge),
    ).rejects.toMatchObject({ code: 'TEAM_MERGE_SUPPLIER_CONFLICT' });
    expect(tx.supplier_identity_links.update).not.toHaveBeenCalled();
  });

  it('re-reads and classifies target state after a P2002 race', async () => {
    const source = link(
      'source-link',
      merge.sourceTeamId,
      'supplier-source',
      false,
    );
    const target = link(
      'target-link',
      merge.targetTeamId,
      'supplier-old',
      true,
    );
    tx.supplier_identity_links.findMany
      .mockResolvedValueOnce([source])
      .mockResolvedValueOnce([source, target]);
    tx.supplier_identity_links.update.mockRejectedValueOnce(new Error('P2002'));
    isPrismaUniqueConstraintError.mockReturnValue(true);

    await expect(migrateSupplierLinks(tx as never, merge)).resolves.toBe(1);
    expect(tx.supplier_identity_links.findMany).toHaveBeenCalledTimes(2);
    expect(tx.supplier_identity_links.update).toHaveBeenLastCalledWith({
      where: { id: target.id },
      data: {
        identityNameSnapshot: merge.targetName,
        isDeleted: false,
        supplierId: source.supplierId,
      },
    });
  });
});
