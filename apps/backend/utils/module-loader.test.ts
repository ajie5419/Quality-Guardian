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
});
