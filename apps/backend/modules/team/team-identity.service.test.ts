import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import prisma from '~/utils/prisma';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';
import { redis } from '~/utils/redis';

import { TeamIdentityService } from './team-identity.service';

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  tx: {
    dictionaries: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    team_identity_aliases: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    team_identity_name_keys: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    team_identity_sources: {
      create: vi.fn(),
    },
  },
}));

vi.mock('~/modules/supplier-identity', () => ({
  SupplierIdentityService: { assertTeamCanBeRetired: vi.fn() },
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: () => ({ error: mocks.loggerError }),
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    ...mocks.tx,
    $transaction: vi.fn(),
  },
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaUniqueConstraintError: vi.fn(),
}));

vi.mock('~/utils/redis', () => ({
  redis: { del: vi.fn() },
}));

const activeTeam = {
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  createdBy: 'admin',
  dictKey: 'Structure BU2',
  dictType: 'team',
  dictValue: 'Structure BU2',
  id: 'team-1',
  isDeleted: false,
  isSystem: false,
  remark: null,
  sort: 1,
  status: 1,
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedBy: 'admin',
};

describe('teamIdentityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) =>
      callback(mocks.tx),
    );
    vi.mocked(isPrismaUniqueConstraintError).mockReturnValue(false);
    vi.mocked(mocks.tx.team_identity_aliases.findFirst).mockResolvedValue(null);
    vi.mocked(mocks.tx.team_identity_name_keys.findUnique).mockResolvedValue(
      null,
    );
    vi.mocked(mocks.tx.dictionaries.findMany).mockResolvedValue([]);
    vi.mocked(redis.del).mockResolvedValue(undefined);
  });

  it('creates the dictionary identity, canonical alias, and manual source atomically', async () => {
    vi.mocked(mocks.tx.dictionaries.create).mockResolvedValue({
      ...activeTeam,
      dictKey: 'Structure\uFF3F BU-2',
      dictValue: 'Structure\uFF3F BU-2',
    });

    const result = await TeamIdentityService.create(
      { name: 'Structure\uFF3F BU-2', sort: 1 },
      'admin',
    );

    expect(result).toMatchObject({
      id: 'team-1',
      name: 'Structure\uFF3F BU-2',
    });
    expect(mocks.tx.team_identity_aliases.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        aliasKind: 'CANONICAL',
        nameKey: 'structurebu2',
        teamId: 'team-1',
      }),
    });
    expect(mocks.tx.team_identity_name_keys.create).toHaveBeenCalledWith({
      data: {
        createdBy: 'admin',
        nameKey: 'structurebu2',
        teamId: 'team-1',
      },
    });
    expect(mocks.tx.team_identity_sources.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceId: 'team-1',
        sourceType: 'MANUAL',
        teamId: 'team-1',
      }),
    });
    expect(redis.del).toHaveBeenCalledWith('qms:dict:options:team');
  });

  it('blocks a normalized collision with a legacy TEAM row', async () => {
    vi.mocked(mocks.tx.dictionaries.findMany).mockResolvedValue([
      { dictKey: 'Structure BU2', id: 'legacy-team' },
    ]);

    await expect(
      TeamIdentityService.create({ name: 'structure-BU2' }, 'admin'),
    ).rejects.toMatchObject({ code: 'TEAM_NAME_COLLISION', httpStatus: 409 });
    expect(mocks.tx.dictionaries.create).not.toHaveBeenCalled();
  });

  it('blocks reuse of a historical alias owned by another TEAM', async () => {
    vi.mocked(mocks.tx.team_identity_name_keys.findUnique).mockResolvedValue({
      teamId: 'team-2',
    } as never);

    await expect(
      TeamIdentityService.create({ name: 'Old Assembly' }, 'admin'),
    ).rejects.toMatchObject({ code: 'TEAM_NAME_COLLISION' });
    expect(mocks.tx.dictionaries.findMany).not.toHaveBeenCalled();
  });

  it('renames with an optimistic guard and preserves the old alias', async () => {
    const renamedTeam = {
      ...activeTeam,
      dictKey: 'Structure BU Two',
      dictValue: 'Structure BU Two',
      updatedAt: new Date('2026-07-02T00:00:00.000Z'),
    };
    vi.mocked(mocks.tx.dictionaries.findFirst)
      .mockResolvedValueOnce(activeTeam)
      .mockResolvedValueOnce(renamedTeam);
    vi.mocked(mocks.tx.dictionaries.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(mocks.tx.team_identity_aliases.findFirst)
      .mockResolvedValueOnce({
        alias: activeTeam.dictKey,
        aliasKind: 'CANONICAL',
        createdAt: activeTeam.createdAt,
        createdBy: 'admin',
        id: 'alias-old',
        isDeleted: false,
        nameKey: 'structurebu2',
        teamId: activeTeam.id,
        updatedAt: activeTeam.updatedAt,
      })
      .mockResolvedValueOnce(null);

    const result = await TeamIdentityService.update(
      activeTeam.id,
      { name: 'Structure BU Two' },
      'admin',
    );

    expect(result.name).toBe('Structure BU Two');
    expect(mocks.tx.team_identity_aliases.update).toHaveBeenCalledWith({
      where: { id: 'alias-old' },
      data: { alias: 'Structure BU2', aliasKind: 'HISTORICAL' },
    });
    expect(mocks.tx.team_identity_aliases.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        alias: 'Structure BU Two',
        aliasKind: 'CANONICAL',
      }),
    });
  });

  it('rejects a concurrent update without writing aliases', async () => {
    vi.mocked(mocks.tx.dictionaries.findFirst).mockResolvedValue(activeTeam);
    vi.mocked(mocks.tx.dictionaries.updateMany).mockResolvedValue({ count: 0 });

    await expect(
      TeamIdentityService.update(activeTeam.id, { name: 'New Name' }, 'admin'),
    ).rejects.toMatchObject({ code: 'TEAM_CONCURRENT_UPDATE' });
    expect(mocks.tx.team_identity_aliases.updateMany).not.toHaveBeenCalled();
  });

  it('resolves active identities and keeps retired names available in batches', async () => {
    vi.mocked(mocks.tx.dictionaries.findFirst).mockResolvedValue(activeTeam);

    await expect(
      TeamIdentityService.resolveById('team-1'),
    ).resolves.toMatchObject({
      id: 'team-1',
      name: 'Structure BU2',
    });

    vi.mocked(mocks.tx.dictionaries.findMany).mockResolvedValue([
      { dictKey: 'Retired TEAM', id: 'team-retired' },
    ]);
    const names = await TeamIdentityService.resolveNamesByIds([
      'team-retired',
      'team-retired',
      null,
    ]);
    expect(names.get('team-retired')).toBe('Retired TEAM');
    expect(mocks.tx.dictionaries.findMany).toHaveBeenLastCalledWith({
      where: {
        id: { in: ['team-retired'] },
        dictType: 'team',
        isDeleted: false,
      },
      select: { dictKey: true, id: true },
    });
  });

  it('lists only active TEAM options with database pagination', async () => {
    vi.mocked(mocks.tx.dictionaries.findMany).mockResolvedValue([activeTeam]);

    const options = await TeamIdentityService.listOptions({
      keyword: 'Structure',
      page: 2,
      pageSize: 20,
    });

    expect(options[0]).toMatchObject({
      label: 'Structure BU2',
      value: 'team-1',
    });
    expect(mocks.tx.dictionaries.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20 }),
    );
  });

  it('retires with supplier-link and optimistic concurrency guards', async () => {
    vi.mocked(mocks.tx.dictionaries.findFirst).mockResolvedValue(activeTeam);
    vi.mocked(mocks.tx.dictionaries.updateMany).mockResolvedValue({ count: 1 });

    await TeamIdentityService.retire(activeTeam.id, 'admin');

    expect(SupplierIdentityService.assertTeamCanBeRetired).toHaveBeenCalledWith(
      activeTeam.id,
    );
    expect(mocks.tx.dictionaries.updateMany).toHaveBeenCalledWith({
      where: {
        id: activeTeam.id,
        updatedAt: activeTeam.updatedAt,
        isDeleted: false,
        status: 1,
      },
      data: { status: 0, updatedBy: 'admin' },
    });
  });
});
