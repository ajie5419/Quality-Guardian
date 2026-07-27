import { beforeEach, describe, expect, it, vi } from 'vitest';

import { migrateTeamReferences } from './team-identity-merge-references';

const tx = {
  inspections: { findMany: vi.fn(), updateMany: vi.fn() },
  qms_inspection_requests: { findMany: vi.fn(), updateMany: vi.fn() },
  supplier_identity_links: {
    delete: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  team_identity_aliases: {
    create: vi.fn(),
    delete: vi.fn(),
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
      .mockResolvedValueOnce([{ id: 'request-1' }])
      .mockResolvedValueOnce([]);
    tx.inspections.findMany
      .mockResolvedValueOnce([{ id: 'inspection-1' }])
      .mockResolvedValueOnce([{ id: 'inspection-1' }])
      .mockResolvedValueOnce([]);
    tx.welders.findMany
      .mockResolvedValueOnce([{ id: 'welder-1' }])
      .mockResolvedValueOnce([{ id: 'welder-1' }])
      .mockResolvedValueOnce([]);
    tx.work_order_requirements.findMany
      .mockResolvedValueOnce([{ id: 'requirement-1' }])
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
        id: 'alias-source',
        isDeleted: false,
        teamId: merge.sourceTeamId,
      },
    ]);
    tx.team_identity_aliases.findFirst.mockResolvedValue(null);
  });

  it('moves every TEAM association and canonical name snapshot', async () => {
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
      data: { team: merge.targetName, teamId: merge.targetTeamId },
    });
    expect(tx.inspections.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['inspection-1'] }, teamId: merge.sourceTeamId },
      data: { team: merge.targetName, teamId: merge.targetTeamId },
    });
    expect(tx.team_identity_aliases.update).toHaveBeenCalledWith({
      where: { id: 'alias-source' },
      data: { aliasKind: 'HISTORICAL', teamId: merge.targetTeamId },
    });
    expect(tx.team_identity_aliases.create).toHaveBeenCalledTimes(2);
  });

  it('removes a source alias when the target already owns the same alias', async () => {
    tx.team_identity_aliases.findMany.mockResolvedValueOnce([
      {
        alias: 'Shared alias',
        id: 'alias-source',
        isDeleted: false,
        teamId: merge.sourceTeamId,
      },
      {
        alias: 'Shared alias',
        id: 'alias-target',
        isDeleted: false,
        teamId: merge.targetTeamId,
      },
    ]);

    await migrateTeamReferences(tx as never, merge, 200, 'admin');

    expect(tx.team_identity_aliases.delete).toHaveBeenCalledWith({
      where: { id: 'alias-source' },
    });
    expect(tx.team_identity_aliases.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'alias-source' } }),
    );
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
});
