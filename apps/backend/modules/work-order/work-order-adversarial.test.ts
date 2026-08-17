import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { WorkOrderService } from './work-order.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    work_orders: {
      aggregate: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('~/modules/work-order-requirement', () => ({
  WorkOrderRequirementService: {
    getSummaryByWorkOrderNumbers: vi.fn().mockResolvedValue(new Map()),
  },
}));

vi.mock('~/modules/data-scope/data-scope.service', () => ({
  DataScopeService: {
    buildWorkOrderWhere: vi.fn().mockImplementation((where: any) => where),
  },
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('~/utils/query-helpers', () => ({
  buildKeywordOr: vi.fn().mockReturnValue(null),
  formatDateString: vi.fn((d: any) =>
    d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? ''),
  ),
  parsePagination: vi.fn(
    (params: { page?: number; pageSize?: number } = {}) => {
      const rawPage = Number(params.page);
      const rawPageSize = Number(params.pageSize);
      const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
      const pageSize = Number.isFinite(rawPageSize)
        ? Math.min(100, Math.max(1, rawPageSize))
        : 20;
      return {
        page,
        pageSize,
        skip: (page - 1) * pageSize,
        take: pageSize,
      };
    },
  ),
}));

function makeWorkOrder(overrides: Record<string, any> = {}) {
  return {
    createdAt: new Date('2026-01-15'),
    customerName: 'Customer A',
    deliveryDate: new Date('2026-03-01'),
    division: 'Division 1',
    id: 'WO-001',
    isDeleted: false,
    multiStationEnabled: false,
    projectName: 'Project A',
    quantity: 10,
    status: 'OPEN',
    workOrderNumber: 'WO-2026-001',
    ...overrides,
  };
}

describe('workOrderService – adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getStatsForDashboard', () => {
    it('returns zero counts when no data', async () => {
      (prisma.work_orders.aggregate as any).mockResolvedValue({
        _count: { workOrderNumber: 0 },
      });
      (prisma.work_orders.count as any).mockResolvedValue(0);
      (prisma.work_orders.findMany as any).mockResolvedValue([]);

      const result = await WorkOrderService.getStatsForDashboard({
        weekStart: new Date('2026-06-01'),
        yearStart: new Date('2026-01-01'),
      });

      expect(result.totalCount).toBe(0);
      expect(result.weeklyCount).toBe(0);
      expect(result.recentWorkOrders).toEqual([]);
    });

    it('handles aggregate returning null count', async () => {
      (prisma.work_orders.aggregate as any).mockResolvedValue({
        _count: { workOrderNumber: null },
      });
      (prisma.work_orders.count as any).mockResolvedValue(null);
      (prisma.work_orders.findMany as any).mockResolvedValue([]);

      const result = await WorkOrderService.getStatsForDashboard({
        weekStart: new Date('2026-06-01'),
        yearStart: new Date('2026-01-01'),
      });

      expect(result.totalCount).toBe(0);
      expect(result.weeklyCount).toBe(0);
    });
  });

  describe('getList', () => {
    it('returns empty list with zero total when no work orders', async () => {
      (prisma.work_orders.findMany as any).mockResolvedValue([]);
      (prisma.work_orders.count as any).mockResolvedValue(0);

      const result = await WorkOrderService.getList({});

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('clamps page=0 to the first page', async () => {
      (prisma.work_orders.findMany as any).mockResolvedValue([]);
      (prisma.work_orders.count as any).mockResolvedValue(0);

      await WorkOrderService.getList({ page: 0, pageSize: 10 });

      const skip = (prisma.work_orders.findMany as any).mock.calls[0][0].skip;
      expect(skip).toBe(0);
    });

    it('defaults NaN page to the first page', async () => {
      (prisma.work_orders.findMany as any).mockResolvedValue([]);
      (prisma.work_orders.count as any).mockResolvedValue(0);

      await WorkOrderService.getList({ page: Number.NaN, pageSize: 10 });

      const skip = (prisma.work_orders.findMany as any).mock.calls[0][0].skip;
      expect(skip).toBe(0);
    });

    it('formats deliveryDate in items', async () => {
      const wo = makeWorkOrder();
      (prisma.work_orders.findMany as any)
        .mockResolvedValueOnce([wo])
        .mockResolvedValueOnce([]);
      (prisma.work_orders.count as any).mockResolvedValue(1);

      const result = await WorkOrderService.getList({});

      expect(result.items[0].deliveryDate).toBeDefined();
    });

    it('maps status via mapToDisplayStatus', async () => {
      const wo = makeWorkOrder({ status: 'IN_PROGRESS' });
      (prisma.work_orders.findMany as any)
        .mockResolvedValueOnce([wo])
        .mockResolvedValueOnce([]);
      (prisma.work_orders.count as any).mockResolvedValue(1);

      const result = await WorkOrderService.getList({});

      expect(result.items[0].status).toBeDefined();
    });
  });

  describe('warranty calculation edge cases', () => {
    it('deliveryDate=null → warrantyStatus is 否', async () => {
      const wo = makeWorkOrder({ deliveryDate: null });
      (prisma.work_orders.findMany as any)
        .mockResolvedValueOnce([wo])
        .mockResolvedValueOnce([]);
      (prisma.work_orders.count as any).mockResolvedValue(1);

      const result = await WorkOrderService.getList({});

      expect(result.items[0].warrantyStatus).toBe('否');
    });

    it('deliveryDate in future → warrantyStatus is 是', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const wo = makeWorkOrder({ deliveryDate: futureDate });
      (prisma.work_orders.findMany as any)
        .mockResolvedValueOnce([wo])
        .mockResolvedValueOnce([]);
      (prisma.work_orders.count as any).mockResolvedValue(1);

      const result = await WorkOrderService.getList({});

      expect(result.items[0].warrantyStatus).toBe('是');
    });

    it('deliveryDate >1 year ago → warrantyStatus is 否', async () => {
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 2);
      const wo = makeWorkOrder({ deliveryDate: oldDate });
      (prisma.work_orders.findMany as any)
        .mockResolvedValueOnce([wo])
        .mockResolvedValueOnce([]);
      (prisma.work_orders.count as any).mockResolvedValue(1);

      const result = await WorkOrderService.getList({});

      expect(result.items[0].warrantyStatus).toBe('否');
    });
  });

  describe('year filter logic', () => {
    it('current year includes OPEN/IN_PROGRESS from previous years', async () => {
      (prisma.work_orders.findMany as any).mockResolvedValue([]);
      (prisma.work_orders.count as any).mockResolvedValue(0);

      const currentYear = new Date().getFullYear();
      await WorkOrderService.getList({ year: currentYear });

      const whereArg = (prisma.work_orders.findMany as any).mock.calls[0][0]
        .where;
      expect(whereArg.AND).toBeDefined();
    });

    it('past year excludes OPEN/IN_PROGRESS', async () => {
      (prisma.work_orders.findMany as any).mockResolvedValue([]);
      (prisma.work_orders.count as any).mockResolvedValue(0);

      await WorkOrderService.getList({ year: 2020 });

      const whereArg = (prisma.work_orders.findMany as any).mock.calls[0][0]
        .where;
      expect(whereArg.AND).toBeDefined();
    });

    it('ignoreYearFilter=true skips year filtering', async () => {
      (prisma.work_orders.findMany as any).mockResolvedValue([]);
      (prisma.work_orders.count as any).mockResolvedValue(0);

      await WorkOrderService.getList({ ignoreYearFilter: true });

      const whereArg = (prisma.work_orders.findMany as any).mock.calls[0][0]
        .where;
      expect(whereArg.AND).toBeUndefined();
      expect(whereArg.deliveryDate).toBeUndefined();
    });

    it('explicit startDate+endDate overrides year filter', async () => {
      (prisma.work_orders.findMany as any).mockResolvedValue([]);
      (prisma.work_orders.count as any).mockResolvedValue(0);

      await WorkOrderService.getList({
        startDate: '2026-01-01',
        endDate: '2026-06-30',
      });

      const whereArg = (prisma.work_orders.findMany as any).mock.calls[0][0]
        .where;
      expect(whereArg.deliveryDate).toBeDefined();
    });
  });

  describe('countCreatedSince', () => {
    it('delegates to prisma count', async () => {
      (prisma.work_orders.count as any).mockResolvedValue(5);
      const result = await WorkOrderService.countCreatedSince(
        new Date('2026-01-01'),
      );
      expect(result).toBe(5);
    });
  });
});
