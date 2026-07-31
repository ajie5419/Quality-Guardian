import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { PartMasterService } from './part-master.service';

vi.mock('~/utils/prisma', () => {
  const client = {
    master_parts: {
      count: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return {
    default: {
      ...client,
      $transaction: vi.fn((callback) => callback(client)),
    },
  };
});

vi.mock('@paralleldrive/cuid2', () => ({
  createId: () => 'part-new',
}));

describe('part master service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('searches only active materials with a bounded result set', async () => {
    vi.mocked(prisma.master_parts.findMany).mockResolvedValue([
      { id: 'part-1', name: 'Frame' },
    ] as never);

    await expect(
      PartMasterService.searchActive({ keyword: ' Frame ', take: 50 }),
    ).resolves.toEqual([{ id: 'part-1', name: 'Frame' }]);
    expect(prisma.master_parts.findMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        name: { contains: 'Frame' },
        status: 1,
      },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
      take: 50,
      select: { id: true, name: true },
    });
  });

  it('seeds missing historical names through the owning module', async () => {
    vi.mocked(prisma.master_parts.createMany).mockResolvedValue({ count: 2 });

    await expect(
      PartMasterService.seedMissingNames([' Frame ', 'Axle', 'Frame', '']),
    ).resolves.toBe(2);
    expect(prisma.master_parts.createMany).toHaveBeenCalledWith({
      data: [
        {
          id: 'part-new',
          isDeleted: false,
          name: 'Frame',
          sort: 0,
          status: 1,
        },
        {
          id: 'part-new',
          isDeleted: false,
          name: 'Axle',
          sort: 1,
          status: 1,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('rejects an empty search keyword at the service boundary', async () => {
    await expect(
      PartMasterService.searchActive({ keyword: ' ', take: 20 }),
    ).rejects.toMatchObject({ code: 'PART_SEARCH_KEYWORD_REQUIRED' });
  });

  it('asserts that referenced materials are active', async () => {
    vi.mocked(prisma.master_parts.findFirst).mockResolvedValue({
      id: 'part-1',
      name: 'Frame',
    } as never);

    await expect(PartMasterService.assertActive('part-1')).resolves.toEqual({
      id: 'part-1',
      name: 'Frame',
    });
    expect(prisma.master_parts.findFirst).toHaveBeenCalledWith({
      where: { id: 'part-1', isDeleted: false, status: 1 },
      select: { id: true, name: true },
    });
  });

  it('rejects inactive or deleted material references', async () => {
    vi.mocked(prisma.master_parts.findFirst).mockResolvedValue(null);

    await expect(
      PartMasterService.assertActive('part-1'),
    ).rejects.toMatchObject({ code: 'PART_NOT_AVAILABLE' });
  });

  it('finds one active material by its normalized exact name', async () => {
    vi.mocked(prisma.master_parts.findMany).mockResolvedValue([
      { id: 'part-1', name: 'Frame' },
    ] as never);

    await expect(
      PartMasterService.findActiveByExactName(' Frame '),
    ).resolves.toEqual({ id: 'part-1', name: 'Frame' });
    expect(prisma.master_parts.findMany).toHaveBeenCalledWith({
      where: { name: 'Frame', isDeleted: false, status: 1 },
      select: { id: true, name: true },
      take: 2,
    });
  });

  it('does not resolve an ambiguous material name', async () => {
    vi.mocked(prisma.master_parts.findMany).mockResolvedValue([
      { id: 'part-1', name: 'Frame' },
      { id: 'part-2', name: 'Frame' },
    ] as never);

    await expect(
      PartMasterService.findActiveByExactName('Frame'),
    ).resolves.toBeNull();
  });

  it('reuses an active material with the same name', async () => {
    vi.mocked(prisma.master_parts.findUnique).mockResolvedValue({
      id: 'part-1',
      isDeleted: false,
      name: 'Frame',
      status: 1,
    } as never);

    await expect(
      PartMasterService.resolveOrCreateActive({ name: ' Frame ' }),
    ).resolves.toEqual({ id: 'part-1', name: 'Frame' });
    expect(prisma.master_parts.create).not.toHaveBeenCalled();
  });

  it('creates a canonical material when a BOM name is new', async () => {
    vi.mocked(prisma.master_parts.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    vi.mocked(prisma.master_parts.create).mockResolvedValue({
      id: 'part-new',
      name: 'Reducer',
      sort: 0,
      status: 1,
    } as never);

    await expect(
      PartMasterService.resolveOrCreateActive({ name: 'Reducer' }),
    ).resolves.toMatchObject({ id: 'part-new', name: 'Reducer' });
  });

  it('paginates management queries in the database', async () => {
    vi.mocked(prisma.master_parts.findMany).mockResolvedValue([
      { id: 'part-1', name: 'Frame', sort: 2, status: 1 },
    ] as never);
    vi.mocked(prisma.master_parts.count).mockResolvedValue(21);

    await expect(
      PartMasterService.listForManagement({
        keyword: 'Frame',
        page: 2,
        pageSize: 20,
        status: 1,
      }),
    ).resolves.toMatchObject({ page: 2, pageSize: 20, total: 21 });
    expect(prisma.master_parts.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20 }),
    );
  });

  it('creates a new material with a cuid', async () => {
    vi.mocked(prisma.master_parts.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.master_parts.create).mockResolvedValue({
      id: 'part-new',
      name: 'Frame',
      sort: 3,
      status: 1,
    } as never);

    await expect(
      PartMasterService.create({ name: ' Frame ', sort: 3 }),
    ).resolves.toMatchObject({ id: 'part-new' });
    expect(prisma.master_parts.create).toHaveBeenCalledWith({
      data: {
        id: 'part-new',
        isDeleted: false,
        name: 'Frame',
        sort: 3,
        status: 1,
      },
      select: expect.any(Object),
    });
  });

  it('restores a soft-deleted material and preserves its ID', async () => {
    vi.mocked(prisma.master_parts.findUnique)
      .mockResolvedValueOnce({ id: 'part-1', isDeleted: true } as never)
      .mockResolvedValueOnce({
        id: 'part-1',
        name: 'Frame',
        sort: 4,
        status: 1,
      } as never);
    vi.mocked(prisma.master_parts.updateMany).mockResolvedValue({ count: 1 });

    await expect(
      PartMasterService.create({ name: 'Frame', sort: 4 }),
    ).resolves.toMatchObject({ id: 'part-1' });
    expect(prisma.master_parts.create).not.toHaveBeenCalled();
    expect(prisma.master_parts.updateMany).toHaveBeenCalledWith({
      where: { id: 'part-1', isDeleted: true },
      data: { isDeleted: false, sort: 4, status: 1 },
    });
  });

  it('rejects an active duplicate material name', async () => {
    vi.mocked(prisma.master_parts.findUnique).mockResolvedValue({
      id: 'part-1',
      isDeleted: false,
    } as never);

    await expect(
      PartMasterService.create({ name: 'Frame' }),
    ).rejects.toMatchObject({ code: 'PART_NAME_CONFLICT' });
  });

  it('soft deletes a material and disables it', async () => {
    vi.mocked(prisma.master_parts.updateMany).mockResolvedValue({ count: 1 });

    await PartMasterService.remove('part-1');

    expect(prisma.master_parts.updateMany).toHaveBeenCalledWith({
      where: { id: 'part-1', isDeleted: false },
      data: { isDeleted: true, status: 0 },
    });
  });
});
