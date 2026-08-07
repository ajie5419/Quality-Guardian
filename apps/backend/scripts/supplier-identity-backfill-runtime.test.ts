import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import {
  assertBackfillIntegrity,
  bootstrapExactTeamLinks,
  compareOpenAuditSnapshots,
  loadSupplierIdentityContext,
  persistResolutionAudit,
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
    team_identity_aliases: { findMany: vi.fn() },
    team_identity_merges: { findMany: vi.fn() },
    unresolved_master_data_refs: {
      findMany: vi.fn(),
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

  it('accepts previously audited conflicts during apply mode', () => {
    expect(() =>
      assertBackfillIntegrity(
        [{ conflicts: 1, name: 'inspections', unresolved: 2 }],
        { changedKeys: [], newKeys: [] },
      ),
    ).not.toThrow();
  });

  it('rejects new or changed open audits during apply mode', () => {
    expect(() =>
      assertBackfillIntegrity(
        [{ conflicts: 1, name: 'inspections', unresolved: 2 }],
        {
          changedKeys: ['inspections:inspection-1:supplierId'],
          newKeys: ['quality_records:record-1:supplierId'],
        },
      ),
    ).toThrow(
      'Supplier identity backfill integrity check failed: open-audits.new=1, open-audits.changed=1',
    );
  });

  it('compares open audit snapshots by key and material signature', () => {
    const before = new Map([
      ['inspections:inspection-1:supplierId', 'same'],
      ['quality_records:record-1:supplierId', 'old'],
    ]);
    const after = new Map([
      ['inspections:inspection-1:supplierId', 'same'],
      ['inspections:inspection-2:teamId', 'new'],
      ['quality_records:record-1:supplierId', 'changed'],
    ]);

    expect(compareOpenAuditSnapshots(before, after)).toEqual({
      changedKeys: ['quality_records:record-1:supplierId'],
      newKeys: ['inspections:inspection-2:teamId'],
    });
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

  it('canonicalizes completed merge sources and historical aliases', async () => {
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([
      { id: 'supplier-1', name: 'Machine BU Supplier' },
    ] as never);
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: '机加 BU', id: 'team-bu' },
      { dictKey: '模具 BU', id: 'team-mould-bu' },
    ] as never);
    vi.mocked(prisma.team_identity_merges.findMany).mockResolvedValue([
      { sourceTeamId: 'team-workshop', targetTeamId: 'team-bu' },
    ] as never);
    vi.mocked(prisma.team_identity_aliases.findMany).mockResolvedValue([
      { alias: '机加车间', teamId: 'team-bu' },
    ] as never);

    const effectiveLinks = new Map([
      [
        'team-bu',
        { supplier: { id: 'supplier-1', name: 'Machine BU Supplier' } },
      ],
    ]);
    const context = await loadSupplierIdentityContext(effectiveLinks);

    expect(context.teamById.get('team-workshop')).toEqual({
      id: 'team-bu',
      name: '机加 BU',
    });
    expect(context.teamByName.get('机加车间')).toEqual({
      id: 'team-bu',
      name: '机加 BU',
    });
    expect(context.effectiveLinks.get('team-workshop')).toEqual(
      effectiveLinks.get('team-bu'),
    );
  });

  it('does not reopen an existing manual resolution during a repeated scan', async () => {
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);

    await persistResolutionAudit({
      entityType: 'quality_records',
      resolved: [],
      unresolved: [
        {
          entityId: 'record-1',
          evidence: { source: 'repeat-scan' },
          rawId: null,
          rawName: 'Historical Supplier',
          reason: 'NO_IDENTITY_EVIDENCE',
        },
      ],
    });

    expect(prisma.unresolved_master_data_refs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.not.objectContaining({
          resolutionNote: expect.anything(),
          resolvedAt: expect.anything(),
          resolvedId: expect.anything(),
          status: expect.anything(),
        }),
      }),
    );
  });
});
