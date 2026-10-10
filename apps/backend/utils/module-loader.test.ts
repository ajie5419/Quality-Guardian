import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

import { ensureModuleMenus } from './module-loader';

vi.mock('~/utils/prisma', () => ({
  default: {
    menus: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('~/utils/redis', () => ({
  redis: {
    delByPattern: vi.fn(),
  },
}));

vi.mock('@paralleldrive/cuid2', () => ({
  createId: () => 'mock-cuid',
}));

describe('module-loader menu synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.menus.findFirst).mockResolvedValue({
      id: 'root',
    } as never);
    vi.mocked(prisma.menus.findMany).mockResolvedValue([]);
    vi.mocked(prisma.menus.create).mockResolvedValue({
      id: 'created-menu',
    } as never);
  });

  it('looks up module menu parents with active non-deleted path filters', async () => {
    await ensureModuleMenus();

    expect(prisma.menus.findFirst).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        path: '/qms',
        status: 1,
      },
      select: { id: true },
    });
  });

  it('creates declared module menus and clears menu cache after changes', async () => {
    await ensureModuleMenus();

    expect(prisma.menus.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isDeleted: false,
          name: 'QMSMetrologyManagement',
          parentId: 'root',
          path: '/qms/metrology',
          status: 1,
          type: 'catalog',
        }),
      }),
    );
    expect(redis.delByPattern).toHaveBeenCalledWith('qms:menu:*');
  });

  it('coalesces concurrent login and menu initialization in one process', async () => {
    await ensureModuleMenus();
    const serialCreates = vi.mocked(prisma.menus.create).mock.calls.length;
    vi.clearAllMocks();
    await Promise.all([
      ensureModuleMenus(),
      ensureModuleMenus(),
      ensureModuleMenus(),
    ]);
    expect(prisma.menus.create).toHaveBeenCalledTimes(serialCreates);
    expect(redis.delByPattern).toHaveBeenCalledTimes(1);
  });

  it('releases a failed initialization so a later request can recover', async () => {
    vi.mocked(prisma.menus.findMany).mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    await expect(
      Promise.all([ensureModuleMenus(), ensureModuleMenus()]),
    ).rejects.toThrow('database unavailable');
    await expect(ensureModuleMenus()).resolves.toBeUndefined();
    expect(redis.delByPattern).toHaveBeenCalledTimes(1);
  });

  it('does not reuse the parent catalog as a legacy leaf menu', async () => {
    vi.mocked(prisma.menus.findFirst).mockImplementation(
      (args) =>
        Promise.resolve('path' in args.where ? { id: 'root' } : null) as never,
    );
    vi.mocked(prisma.menus.findMany).mockResolvedValue([
      {
        id: 'root',
        name: 'QMSMetrologyManagement',
        path: '/qms/metrology',
        type: 'catalog',
      },
    ] as never);
    await ensureModuleMenus();
    expect(prisma.menus.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'root' } }),
    );
    expect(prisma.menus.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'QMSMetrologyLedger',
          parentId: 'root',
          path: '/qms/metrology/ledger',
        }),
      }),
    );
  });
});
