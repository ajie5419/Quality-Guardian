import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { remediateTeamIdentitySources } from './remediate-team-identity-sources';

vi.mock('~/utils/prisma', () => ({
  default: {
    departments: { findMany: vi.fn() },
    dictionaries: { findMany: vi.fn() },
    supplier_identity_links: { findMany: vi.fn() },
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
    vi.mocked(prisma.$transaction).mockImplementation((callback) =>
      callback(prisma as never),
    );
    vi.mocked(prisma.team_identity_sources.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.team_identity_sources.findFirst).mockResolvedValue(null);
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
});
