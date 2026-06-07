import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeptService } from '~/modules/dept/dept.service';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

vi.mock('@paralleldrive/cuid2', () => ({
  createId: () => 'dept-id',
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    departments: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('~/utils/redis', () => ({
  redis: {
    del: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe('deptService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns cached department tree without querying database', async () => {
    const cached = [{ id: 'dept-1', name: 'Quality', children: [] }];
    vi.mocked(redis.get).mockResolvedValue(cached as never);

    const result = await DeptService.findAll();

    expect(result).toEqual(cached);
    expect(prisma.departments.findMany).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('builds and caches department tree when cache misses', async () => {
    vi.mocked(redis.get).mockResolvedValue(null as never);
    vi.mocked(prisma.departments.findMany).mockResolvedValue([
      { id: 'root', name: 'Root', parentId: '0', sort: 1 },
      { id: 'child', name: 'Child', parentId: 'root', sort: 2 },
    ] as never);

    const result = await DeptService.findAll();

    expect(prisma.departments.findMany).toHaveBeenCalledWith({
      where: { isDeleted: false },
      orderBy: { sort: 'asc' },
    });
    expect(result[0]?.children?.[0]?.id).toBe('child');
    expect(redis.set).toHaveBeenCalledWith('qms:dept:tree', result, 86_400);
  });

  it('invalidates cache and normalizes create payload defaults', async () => {
    vi.mocked(prisma.departments.create).mockResolvedValue({
      id: 'dept-dept-id',
    } as never);

    await DeptService.create({ name: 'Assembly', sort: 3 });

    expect(redis.del).toHaveBeenCalledWith('qms:dept:tree');
    expect(prisma.departments.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'dept-dept-id',
        businessUnit: null,
        description: null,
        isDeleted: false,
        name: 'Assembly',
        parentId: '0',
        sort: 3,
        status: 1,
      }),
    });
  });

  it('searches vehicle SOBU departments by both name fragments', async () => {
    vi.mocked(prisma.departments.findMany).mockResolvedValue([
      { id: 'dept-1' },
      { id: '' },
      { id: 'dept-2' },
    ] as never);

    const result = await DeptService.findVehicleSobuIds();

    expect(result).toEqual(['dept-1', 'dept-2']);
    expect(prisma.departments.findMany).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        isDeleted: false,
        name: { contains: '车辆' },
        AND: [{ name: { contains: 'SOBU' } }],
      },
    });
  });

  it('builds active department tree with minimal select fields', async () => {
    vi.mocked(prisma.departments.findMany).mockResolvedValue([
      { id: 'root', name: 'Root', parentId: '0' },
      { id: 'child', name: 'Child', parentId: 'root' },
    ] as never);

    const result = await DeptService.findActiveTree();

    expect(result[0]?.children?.[0]?.id).toBe('child');
    expect(prisma.departments.findMany).toHaveBeenCalledWith({
      where: { isDeleted: false, status: 1 },
      orderBy: { sort: 'asc' },
      select: { id: true, name: true, parentId: true },
    });
  });

  it('invalidates cache and updates only provided department fields', async () => {
    await DeptService.update('dept-1', {
      businessUnit: 'BU1',
      parentId: 'root',
      sort: 7,
      status: 0,
    });

    expect(redis.del).toHaveBeenCalledWith('qms:dept:tree');
    expect(prisma.departments.update).toHaveBeenCalledWith({
      where: { id: 'dept-1' },
      data: {
        businessUnit: 'BU1',
        parentId: 'root',
        sort: 7,
        status: 0,
        updatedAt: expect.any(Date),
      },
    });
  });

  it('invalidates cache and soft deletes department', async () => {
    await DeptService.delete('dept-1');

    expect(redis.del).toHaveBeenCalledWith('qms:dept:tree');
    expect(prisma.departments.update).toHaveBeenCalledWith({
      where: { id: 'dept-1' },
      data: {
        isDeleted: true,
        updatedAt: expect.any(Date),
      },
    });
  });
});
