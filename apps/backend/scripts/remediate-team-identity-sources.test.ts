import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { remediateTeamIdentitySources } from './remediate-team-identity-sources';

vi.mock('~/utils/prisma', () => ({
  default: {
    departments: { findMany: vi.fn() },
    dictionaries: { findFirst: vi.fn(), findMany: vi.fn() },
    quality_records: { updateMany: vi.fn() },
    supplier_identity_links: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    suppliers: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
    team_identity_sources: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: vi
    .fn()
    .mockReturnValue({ fatal: vi.fn(), info: vi.fn() }),
}));

const outsourcingSupplier = {
  category: 'Outsourcing',
  id: 'supplier-1',
  isDeleted: false,
  name: '秦皇岛利强机械制造有限公司',
  outsourcingMode: 'IN_HOUSE_TEAM',
};

const linkOnlyTeam = [
  {
    id: 'link-1',
    identityId: 'team-1',
    identityNameSnapshot: '秦皇岛利强机械制造有限公司',
    identityType: 'TEAM',
    isDeleted: false,
    supplierId: 'supplier-1',
    supplier: outsourcingSupplier,
  },
] as never;

describe('remediateTeamIdentitySources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue([]);
    vi.mocked(prisma.team_identity_sources.findMany).mockResolvedValue([]);
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([]);
    vi.mocked(prisma.departments.findMany).mockResolvedValue([]);
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([]);
    vi.mocked(prisma.suppliers.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.quality_records.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.dictionaries.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.suppliers.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.$transaction).mockImplementation((callback) =>
      callback(prisma as never),
    );
    vi.mocked(prisma.team_identity_sources.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.team_identity_sources.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.supplier_identity_links.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.supplier_identity_links.findFirst).mockResolvedValue(null);
  });

  it('plans a SUPPLIER source for a link-only external TEAM', async () => {
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue(
      linkOnlyTeam,
    );
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: '秦皇岛利强机械制造有限公司', id: 'team-1' },
    ] as never);

    const summary = await remediateTeamIdentitySources({ mode: 'dry-run' });

    expect(summary.supplierSources).toEqual([
      {
        sourceId: 'supplier-1',
        teamId: 'team-1',
        teamName: '秦皇岛利强机械制造有限公司',
      },
    ]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates a source when no row exists', async () => {
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue(
      linkOnlyTeam,
    );
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: '秦皇岛利强机械制造有限公司', id: 'team-1' },
    ] as never);

    await remediateTeamIdentitySources({ mode: 'apply' });

    expect(prisma.team_identity_sources.create).toHaveBeenCalledWith({
      data: {
        sourceId: 'supplier-1',
        sourceType: 'SUPPLIER',
        teamId: 'team-1',
      },
    });
  });

  it('revives a soft-deleted source row instead of creating a duplicate', async () => {
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue(
      linkOnlyTeam,
    );
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: '秦皇岛利强机械制造有限公司', id: 'team-1' },
    ] as never);
    vi.mocked(prisma.team_identity_sources.updateMany).mockResolvedValue({
      count: 1,
    });

    const summary = await remediateTeamIdentitySources({ mode: 'apply' });

    expect(prisma.team_identity_sources.updateMany).toHaveBeenCalledWith({
      where: {
        isDeleted: true,
        sourceId: 'supplier-1',
        sourceType: 'SUPPLIER',
      },
      data: { isDeleted: false, teamId: 'team-1' },
    });
    expect(summary.revived).toEqual([
      {
        sourceId: 'supplier-1',
        sourceType: 'SUPPLIER',
        teamId: 'team-1',
        teamName: '秦皇岛利强机械制造有限公司',
      },
    ]);
  });

  it('plans a DEPARTMENT source for a link-less internal TEAM with a unique department', async () => {
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: '机加 BU', id: 'team-2' },
    ] as never);
    vi.mocked(prisma.departments.findMany).mockResolvedValue([
      { id: 'dept-1', name: '机加 BU' },
    ] as never);

    const summary = await remediateTeamIdentitySources({ mode: 'dry-run' });

    expect(summary.departmentSources).toEqual([
      { sourceId: 'dept-1', teamId: 'team-2', teamName: '机加 BU' },
    ]);
  });

  it('does not touch a TEAM that already carries the matching source', async () => {
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue(
      linkOnlyTeam,
    );
    vi.mocked(prisma.team_identity_sources.findMany).mockResolvedValue([
      { sourceId: 'supplier-1', sourceType: 'SUPPLIER', teamId: 'team-1' },
    ] as never);
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: '秦皇岛利强机械制造有限公司', id: 'team-1' },
    ] as never);

    const summary = await remediateTeamIdentitySources({ mode: 'dry-run' });

    expect(summary.supplierSources).toEqual([]);
  });

  it('does not recreate an active source already owned by the same team', async () => {
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue(
      linkOnlyTeam,
    );
    vi.mocked(prisma.team_identity_sources.findMany).mockResolvedValue([
      { sourceId: 'supplier-1', sourceType: 'SUPPLIER', teamId: 'team-1' },
    ] as never);
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: '秦皇岛利强机械制造有限公司', id: 'team-1' },
    ] as never);
    vi.mocked(prisma.team_identity_sources.findFirst).mockResolvedValue({
      isDeleted: false,
      teamId: 'team-1',
    } as never);

    await remediateTeamIdentitySources({ mode: 'apply' });

    expect(prisma.team_identity_sources.create).not.toHaveBeenCalled();
  });

  it('plans a confirmed TEAM supplier link when the mapping is missing', async () => {
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      {
        dictKey: '卢龙县强盛科技有限公司',
        id: '0e9b4248568311f1881c00163e37355f',
      },
    ] as never);
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([
      {
        category: 'Outsourcing',
        id: 'SUP-1769076104551-s4sh',
        outsourcingMode: 'IN_HOUSE_TEAM',
      },
    ] as never);

    const summary = await remediateTeamIdentitySources({ mode: 'dry-run' });

    expect(summary.links).toEqual([
      {
        supplierId: 'SUP-1769076104551-s4sh',
        teamId: '0e9b4248568311f1881c00163e37355f',
        teamName: '卢龙县强盛科技有限公司',
      },
    ]);
  });

  it('creates the confirmed link and source in apply mode', async () => {
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      {
        dictKey: '卢龙县强盛科技有限公司',
        id: '0e9b4248568311f1881c00163e37355f',
      },
    ] as never);
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([
      {
        category: 'Outsourcing',
        id: 'SUP-1769076104551-s4sh',
        outsourcingMode: 'IN_HOUSE_TEAM',
      },
    ] as never);
    vi.mocked(prisma.dictionaries.findFirst).mockResolvedValue({
      dictKey: '卢龙县强盛科技有限公司',
    } as never);
    vi.mocked(prisma.suppliers.findFirst).mockResolvedValue({
      category: 'Outsourcing',
      outsourcingMode: 'IN_HOUSE_TEAM',
    } as never);
    vi.mocked(prisma.supplier_identity_links.findFirst).mockResolvedValue(null);

    await remediateTeamIdentitySources({ mode: 'apply' });

    expect(prisma.supplier_identity_links.create).toHaveBeenCalledWith({
      data: {
        identityId: '0e9b4248568311f1881c00163e37355f',
        identityNameSnapshot: '卢龙县强盛科技有限公司',
        identityType: 'TEAM',
        supplierId: 'SUP-1769076104551-s4sh',
      },
    });
    expect(prisma.team_identity_sources.create).toHaveBeenCalledWith({
      data: {
        sourceId: 'SUP-1769076104551-s4sh',
        sourceType: 'SUPPLIER',
        teamId: '0e9b4248568311f1881c00163e37355f',
      },
    });
  });

  it('sets the missing outsourcing mode for confirmed suppliers before linking', async () => {
    vi.mocked(prisma.dictionaries.findFirst).mockResolvedValue({
      dictKey: '卢龙县强盛科技有限公司',
    } as never);
    vi.mocked(prisma.suppliers.findFirst).mockResolvedValue({
      category: 'Outsourcing',
      outsourcingMode: 'IN_HOUSE_TEAM',
    } as never);

    await remediateTeamIdentitySources({ mode: 'apply' });

    expect(prisma.suppliers.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'SUP-1769076104551-s4sh',
        isDeleted: false,
        outsourcingMode: null,
      },
      data: { outsourcingMode: 'IN_HOUSE_TEAM' },
    });
  });

  it('repairs a confirmed link that points to a different supplier', async () => {
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue([
      {
        id: 'link-1',
        identityId: '0e9b4248568311f1881c00163e37355f',
        identityNameSnapshot: '卢龙县强盛科技有限公司',
        identityType: 'TEAM',
        isDeleted: false,
        supplierId: 'SUP-WRONG',
        supplier: { ...outsourcingSupplier, id: 'SUP-WRONG' },
      },
    ] as never);
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      {
        dictKey: '卢龙县强盛科技有限公司',
        id: '0e9b4248568311f1881c00163e37355f',
      },
    ] as never);
    vi.mocked(prisma.suppliers.findMany).mockResolvedValue([
      {
        category: 'Outsourcing',
        id: 'SUP-1769076104551-s4sh',
        outsourcingMode: 'IN_HOUSE_TEAM',
      },
    ] as never);
    vi.mocked(prisma.dictionaries.findFirst).mockResolvedValue({
      dictKey: '卢龙县强盛科技有限公司',
    } as never);
    vi.mocked(prisma.suppliers.findFirst).mockResolvedValue({
      category: 'Outsourcing',
      outsourcingMode: 'IN_HOUSE_TEAM',
    } as never);
    vi.mocked(prisma.supplier_identity_links.updateMany).mockResolvedValue({
      count: 1,
    });

    await remediateTeamIdentitySources({ mode: 'apply' });

    expect(prisma.supplier_identity_links.updateMany).toHaveBeenCalledWith({
      where: {
        identityId: '0e9b4248568311f1881c00163e37355f',
        identityType: 'TEAM',
        isDeleted: false,
        supplierId: { not: 'SUP-1769076104551-s4sh' },
      },
      data: {
        identityNameSnapshot: '卢龙县强盛科技有限公司',
        supplierId: 'SUP-1769076104551-s4sh',
      },
    });
  });

  it('aligns linked quality records to the confirmed TEAM supplier', async () => {
    vi.mocked(prisma.dictionaries.findFirst).mockResolvedValue({
      dictKey: '卢龙县强盛科技有限公司',
    } as never);
    vi.mocked(prisma.suppliers.findFirst).mockResolvedValue({
      category: 'Outsourcing',
      outsourcingMode: 'IN_HOUSE_TEAM',
    } as never);
    vi.mocked(prisma.quality_records.updateMany).mockImplementation((async ({
      where,
    }: {
      where: { inspection?: { teamId?: string } };
    }) => ({
      count:
        where.inspection?.teamId === '0e9b4248568311f1881c00163e37355f' ? 1 : 0,
    })) as never);

    const summary = await remediateTeamIdentitySources({ mode: 'apply' });

    expect(prisma.quality_records.updateMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        inspection: {
          isDeleted: false,
          teamId: '0e9b4248568311f1881c00163e37355f',
        },
        NOT: { supplierId: 'SUP-1769076104551-s4sh' },
      },
      data: {
        supplierId: 'SUP-1769076104551-s4sh',
        supplierName: '卢龙县强盛科技有限公司',
      },
    });
    expect(summary.qualityRecordsAligned).toEqual([
      {
        supplierId: 'SUP-1769076104551-s4sh',
        teamId: '0e9b4248568311f1881c00163e37355f',
        teamName: '卢龙县强盛科技有限公司',
      },
    ]);
  });

  it('does not run remediation in release maintenance', () => {
    const backendRoot = process.cwd().endsWith('/apps/backend')
      ? process.cwd()
      : resolve(process.cwd(), 'apps/backend');
    const maintenance = readFileSync(
      resolve(backendRoot, 'scripts/run-release-maintenance.sh'),
      'utf8',
    );
    expect(maintenance).not.toContain(
      'scripts/remediate-team-identity-sources.ts',
    );
    expect(maintenance).not.toContain(
      'scripts/remediate-confirmed-inspection-identity-rows.ts',
    );
  });
});
