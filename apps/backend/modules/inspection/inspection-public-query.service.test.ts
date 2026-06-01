import { SUPPLIER_CATEGORY } from '@qgs/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionPublicQueryService } from '~/modules/inspection/inspection-public-query.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    suppliers: {
      findMany: vi.fn(),
    },
  },
}));

describe('inspection public query service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists public suppliers from the supplier category by default', async () => {
    (prisma.suppliers.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'Supplier A' },
    ]);

    const result = await InspectionPublicQueryService.getPublicSuppliers(
      '  abc  ',
      '',
    );

    expect(prisma.suppliers.findMany).toHaveBeenCalledWith({
      where: {
        category: SUPPLIER_CATEGORY.SUPPLIER,
        isDeleted: false,
        name: { contains: 'abc' },
      },
      orderBy: { name: 'asc' },
      take: 100,
      select: { name: true },
    });
    expect(result).toEqual([{ label: 'Supplier A', value: 'Supplier A' }]);
  });

  it('lists public suppliers from the requested outsourcing category', async () => {
    (prisma.suppliers.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'Outsourcing A' },
    ]);

    const result = await InspectionPublicQueryService.getPublicSuppliers(
      '',
      SUPPLIER_CATEGORY.OUTSOURCING,
    );

    expect(prisma.suppliers.findMany).toHaveBeenCalledWith({
      where: {
        category: SUPPLIER_CATEGORY.OUTSOURCING,
        isDeleted: false,
      },
      orderBy: { name: 'asc' },
      take: 100,
      select: { name: true },
    });
    expect(result).toEqual([
      { label: 'Outsourcing A', value: 'Outsourcing A' },
    ]);
  });
});
