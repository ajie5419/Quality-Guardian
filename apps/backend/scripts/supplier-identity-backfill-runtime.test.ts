import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import {
  assertBackfillIntegrity,
  loadExplicitTeamLinks,
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
    team_identity_sources: { findMany: vi.fn() },
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

  it('rejects previously audited conflicts during every apply run', () => {
    expect(() =>
      assertBackfillIntegrity([
        { conflicts: 1, name: 'inspections', unresolved: 2 },
      ]),
    ).toThrow(
      'Supplier identity backfill integrity check failed: inspections.conflicts=1, inspections.unresolved=2',
    );
  });

  it('audits invalid explicit TEAM links without creating links from names', async () => {
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: 'Resident Team', id: 'team-1' },
    ] as never);
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue([
      {
        identityId: 'team-1',
        isDeleted: false,
        id: 'link-1',
        identityNameSnapshot: 'Resident Team',
        supplier: {
          category: 'Supplier',
          id: 'supplier-linked',
          isDeleted: false,
          name: 'Other Supplier',
          outsourcingMode: null,
        },
        supplierId: 'supplier-linked',
      },
    ] as never);
    vi.mocked(prisma.team_identity_sources.findMany).mockResolvedValue([]);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);

    await expect(loadExplicitTeamLinks('apply')).resolves.toMatchObject({
      conflicts: 1,
    });
    expect(prisma.unresolved_master_data_refs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          entityId: 'link-1',
          entityType: 'supplier_identity_links',
          reason: 'invalid_explicit_process_team_link',
        }),
      }),
    );
  });

  it('audits a policy-valid link without its exact SUPPLIER source', async () => {
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: 'Resident Team', id: 'team-1' },
    ] as never);
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue([
      {
        identityId: 'team-1',
        isDeleted: false,
        id: 'link-1',
        identityNameSnapshot: 'Resident Team',
        supplier: {
          category: 'Outsourcing',
          id: 'supplier-linked',
          isDeleted: false,
          name: 'Resident Supplier',
          outsourcingMode: 'IN_HOUSE_TEAM',
        },
        supplierId: 'supplier-linked',
      },
    ] as never);
    vi.mocked(prisma.team_identity_sources.findMany).mockResolvedValue([]);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);

    const result = await loadExplicitTeamLinks('apply');
    expect(result.conflicts).toBe(1);
    expect(result.effectiveLinks).toEqual(new Map());
    expect(prisma.unresolved_master_data_refs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          reason: 'invalid_explicit_process_team_link',
        }),
      }),
    );
  });

  it('treats a TEAM with DEPARTMENT and SUPPLIER sources as an invalid link', async () => {
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: 'Conflicted Team', id: 'team-1' },
    ] as never);
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue([
      {
        identityId: 'team-1',
        isDeleted: false,
        id: 'link-1',
        identityNameSnapshot: 'Conflicted Team',
        supplier: {
          category: 'Outsourcing',
          id: 'supplier-linked',
          isDeleted: false,
          name: 'Resident Supplier',
          outsourcingMode: 'IN_HOUSE_TEAM',
        },
        supplierId: 'supplier-linked',
      },
    ] as never);
    vi.mocked(prisma.team_identity_sources.findMany).mockResolvedValue([
      {
        sourceId: 'department-1',
        sourceType: 'DEPARTMENT',
        teamId: 'team-1',
      },
      {
        sourceId: 'supplier-linked',
        sourceType: 'SUPPLIER',
        teamId: 'team-1',
      },
    ] as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);

    await expect(loadExplicitTeamLinks('apply')).resolves.toMatchObject({
      conflicts: 1,
      effectiveLinks: new Map(),
    });
    expect(prisma.unresolved_master_data_refs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          evidence: expect.objectContaining({ teamSourceConflict: 'true' }),
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
    vi.mocked(prisma.team_identity_sources.findMany).mockResolvedValue([]);

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

  it('classifies only DEPARTMENT-only TEAMs as internal', async () => {
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.team_identity_merges.findMany).mockResolvedValue(
      [] as never,
    );
    vi.mocked(prisma.team_identity_aliases.findMany).mockResolvedValue(
      [] as never,
    );
    vi.mocked(prisma.team_identity_sources.findMany).mockResolvedValue([
      {
        sourceType: 'DEPARTMENT',
        teamId: 'team-internal',
      },
      {
        sourceType: 'SUPPLIER',
        teamId: 'team-external',
      },
      {
        sourceType: 'DEPARTMENT',
        teamId: 'team-conflicted',
      },
      {
        sourceType: 'SUPPLIER',
        teamId: 'team-conflicted',
      },
    ] as never);

    const context = await loadSupplierIdentityContext(new Map());

    expect(context.internalTeamIds).toEqual(new Set(['team-internal']));
    expect(context.externalTeamIds).toEqual(
      new Set(['team-conflicted', 'team-external']),
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
