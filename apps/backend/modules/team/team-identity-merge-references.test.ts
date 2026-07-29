import { beforeEach, describe, expect, it, vi } from 'vitest';

import { migrateTeamReferences } from './team-identity-merge-references';

const tx = {
  inspections: { findMany: vi.fn(), updateMany: vi.fn() },
  metric_refresh_jobs: {
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  qms_inspection_requests: { findMany: vi.fn(), updateMany: vi.fn() },
  supplier_identity_links: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  team_identity_aliases: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  team_identity_name_keys: { updateMany: vi.fn() },
  team_identity_sources: { updateMany: vi.fn() },
  unresolved_master_data_refs: { updateMany: vi.fn() },
  welders: { findMany: vi.fn(), updateMany: vi.fn() },
  work_order_requirements: { findMany: vi.fn(), updateMany: vi.fn() },
};

const merge = {
  auditId: 'merge-1',
  sourceName: 'Structure BU2',
  sourceTeamId: 'team-source',
  targetName: 'StructureBU2',
  targetTeamId: 'team-target',
};

describe('team identity merge references', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.qms_inspection_requests.findMany
      .mockResolvedValueOnce([{ id: 'request-1' }])
      .mockResolvedValueOnce([]);
    tx.inspections.findMany
      .mockResolvedValueOnce([{ id: 'inspection-1' }])
      .mockResolvedValueOnce([]);
    tx.welders.findMany
      .mockResolvedValueOnce([{ id: 'welder-1' }])
      .mockResolvedValueOnce([]);
    tx.work_order_requirements.findMany
      .mockResolvedValueOnce([{ id: 'requirement-1' }])
      .mockResolvedValueOnce([]);
    tx.qms_inspection_requests.updateMany.mockResolvedValue({ count: 1 });
    tx.inspections.updateMany.mockResolvedValue({ count: 1 });
    tx.welders.updateMany.mockResolvedValue({ count: 1 });
    tx.work_order_requirements.updateMany.mockResolvedValue({ count: 1 });
    tx.supplier_identity_links.findMany.mockResolvedValue([
      {
        id: 'link-1',
        identityId: merge.sourceTeamId,
        isDeleted: false,
        supplierId: 'supplier-1',
      },
    ]);
    tx.team_identity_sources.updateMany.mockResolvedValue({ count: 1 });
    tx.team_identity_name_keys.updateMany.mockResolvedValue({ count: 1 });
    tx.team_identity_aliases.findMany.mockResolvedValue([
      {
        alias: merge.sourceName,
        aliasKind: 'CANONICAL',
        id: 'alias-source',
        isDeleted: false,
        nameKey: 'structurebu2',
        teamId: merge.sourceTeamId,
      },
    ]);
    tx.team_identity_aliases.findFirst.mockResolvedValue(null);
  });

  it('moves every TEAM association without rewriting name snapshots', async () => {
    tx.team_identity_aliases.findFirst
      .mockResolvedValueOnce({
        aliasKind: 'HISTORICAL',
        id: 'alias-source',
      })
      .mockResolvedValueOnce({
        aliasKind: 'CANONICAL',
        id: 'alias-source',
      });

    await expect(
      migrateTeamReferences(tx as never, merge, 200, 'admin'),
    ).resolves.toEqual({
      inspections: 1,
      inspectionRequests: 1,
      supplierIdentityLinks: 1,
      teamAliases: 1,
      teamNameKeys: 1,
      teamSources: 1,
      welders: 1,
      workOrderRequirements: 1,
    });

    expect(tx.qms_inspection_requests.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['request-1'] }, teamId: merge.sourceTeamId },
      data: { teamId: merge.targetTeamId },
    });
    expect(tx.inspections.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['inspection-1'] }, teamId: merge.sourceTeamId },
      data: { teamId: merge.targetTeamId },
    });
    expect(tx.welders.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['welder-1'] }, teamId: merge.sourceTeamId },
      data: { teamId: merge.targetTeamId },
    });
    expect(tx.work_order_requirements.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['requirement-1'] },
        responsibleTeamId: merge.sourceTeamId,
      },
      data: { responsibleTeamId: merge.targetTeamId },
    });
    expect(tx.team_identity_aliases.update).toHaveBeenCalledWith({
      where: { id: 'alias-source' },
      data: { aliasKind: 'HISTORICAL', teamId: merge.targetTeamId },
    });
    expect(tx.team_identity_aliases.create).not.toHaveBeenCalled();
  });

  it('deduplicates aliases by normalized name key and keeps canonical precedence', async () => {
    tx.team_identity_aliases.findMany.mockResolvedValueOnce([
      {
        alias: merge.sourceName,
        aliasKind: 'CANONICAL',
        id: 'alias-source',
        isDeleted: false,
        nameKey: 'structurebu2',
        teamId: merge.sourceTeamId,
      },
      {
        alias: merge.targetName,
        aliasKind: 'CANONICAL',
        id: 'alias-target',
        isDeleted: false,
        nameKey: 'structurebu2',
        teamId: merge.targetTeamId,
      },
    ]);
    tx.team_identity_aliases.findFirst.mockResolvedValue({
      aliasKind: 'CANONICAL',
      id: 'alias-target',
    });

    await migrateTeamReferences(tx as never, merge, 200, 'admin');

    expect(tx.team_identity_aliases.update).toHaveBeenCalledWith({
      where: { id: 'alias-source' },
      data: { isDeleted: true },
    });
    expect(tx.team_identity_aliases.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ aliasKind: 'HISTORICAL' }),
        where: { id: 'alias-target' },
      }),
    );
    expect(tx.team_identity_aliases.create).not.toHaveBeenCalled();
  });

  it('restores a deleted target supplier link from the active source link', async () => {
    tx.supplier_identity_links.findMany.mockResolvedValueOnce([
      {
        id: 'link-source',
        identityId: merge.sourceTeamId,
        isDeleted: false,
        supplierId: 'supplier-source',
      },
      {
        id: 'link-target',
        identityId: merge.targetTeamId,
        isDeleted: true,
        supplierId: 'supplier-old',
      },
    ]);

    await migrateTeamReferences(tx as never, merge, 200, 'admin');

    expect(tx.supplier_identity_links.update).toHaveBeenCalledWith({
      where: { id: 'link-target' },
      data: {
        identityNameSnapshot: merge.targetName,
        isDeleted: false,
        supplierId: 'supplier-source',
      },
    });
  });

  it('rolls back the batch when a welder CAS update loses a row', async () => {
    tx.welders.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      migrateTeamReferences(tx as never, merge, 200, 'admin'),
    ).rejects.toMatchObject({ code: 'TEAM_MERGE_REFERENCE_CONFLICT' });

    expect(tx.unresolved_master_data_refs.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ entityType: 'welders' }),
      }),
    );
  });
});
