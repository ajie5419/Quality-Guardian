import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/utils/prisma', () => ({
  default: {
    unresolved_master_data_refs: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

describe('master data resolution audit service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists open references with bounded pagination', async () => {
    const { MasterDataResolutionAuditService } = await import(
      './master-data-resolution-audit.service'
    );
    const { default: prisma } = await import('~/utils/prisma');
    vi.mocked(prisma.unresolved_master_data_refs.findMany).mockResolvedValue(
      [] as never,
    );
    vi.mocked(prisma.unresolved_master_data_refs.count).mockResolvedValue(0);

    await expect(
      MasterDataResolutionAuditService.list({
        page: 2,
        pageSize: 500,
        status: 'OPEN',
      }),
    ).resolves.toEqual({ items: [], total: 0 });
    expect(prisma.unresolved_master_data_refs.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 100,
        take: 100,
        where: expect.objectContaining({ isDeleted: false, status: 'OPEN' }),
      }),
    );
  });

  it('resolves an open reference with compare-and-set semantics', async () => {
    const { MasterDataResolutionAuditService } = await import(
      './master-data-resolution-audit.service'
    );
    const { default: prisma } = await import('~/utils/prisma');
    vi.mocked(prisma.unresolved_master_data_refs.updateMany).mockResolvedValue({
      count: 1,
    });

    await MasterDataResolutionAuditService.resolve({
      id: 'audit-1',
      note: 'Confirmed by administrator',
      resolvedId: 'subcategory-1',
    });

    expect(prisma.unresolved_master_data_refs.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resolvedId: 'subcategory-1',
          status: 'RESOLVED',
        }),
        where: expect.objectContaining({ id: 'audit-1', status: 'OPEN' }),
      }),
    );
  });
});
