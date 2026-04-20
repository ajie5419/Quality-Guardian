import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '../../utils/prisma';
import { WorkOrderService } from '../work-order.service';

// Mock prisma and logger
vi.mock('../../utils/prisma', () => ({
  default: {
    work_orders: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('workOrderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getList', () => {
    it('should set warrantyStatus based on deliveryDate + 1 year', async () => {
      const now = new Date('2026-04-16T00:00:00.000Z');
      vi.useFakeTimers();
      try {
        vi.setSystemTime(now);

        const mockWorkOrders = [
          {
            workOrderNumber: 'WO-IN',
            projectName: 'Project In Warranty',
            status: 'OPEN',
            deliveryDate: new Date('2025-09-01T00:00:00.000Z'),
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            quantity: 10,
            customerName: 'Customer A',
            division: 'Division A',
            effectiveTime: null,
          },
          {
            workOrderNumber: 'WO-OUT',
            projectName: 'Project Out Warranty',
            status: 'OPEN',
            deliveryDate: new Date('2024-01-01T00:00:00.000Z'),
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
            quantity: 10,
            customerName: 'Customer B',
            division: 'Division B',
            effectiveTime: null,
          },
        ];

        (prisma.work_orders.findMany as any).mockResolvedValueOnce(
          mockWorkOrders,
        );
        (prisma.work_orders.count as any).mockResolvedValueOnce(2);
        (prisma.work_orders.findMany as any).mockResolvedValueOnce([]);

        const result = await WorkOrderService.getList({
          page: 1,
          pageSize: 10,
        });

        expect(result.items[0].warrantyStatus).toBe('是');
        expect(result.items[1].warrantyStatus).toBe('否');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should correctly format work order items', async () => {
      const mockWorkOrders = [
        {
          workOrderNumber: 'WO001',
          projectName: 'Project A',
          status: 'OPEN',
          deliveryDate: new Date('2024-05-20'),
          createdAt: new Date('2024-01-01T10:00:00Z'),
          quantity: 100,
          customerName: 'Customer X',
          division: 'Division Y',
          effectiveTime: new Date('2024-01-01'),
        },
      ];

      (prisma.work_orders.findMany as any).mockResolvedValueOnce(
        mockWorkOrders,
      );
      (prisma.work_orders.count as any).mockResolvedValueOnce(1);
      (prisma.work_orders.findMany as any).mockResolvedValueOnce([
        { status: 'OPEN', division: 'Division Y', quantity: 100 },
      ]);

      const result = await WorkOrderService.getList({ page: 1, pageSize: 10 });

      expect(result.total).toBe(1);
      expect(result.items[0].id).toBe('WO001');
      expect(result.items[0].deliveryDate).toBe('2024-05-20');
      expect(result.items[0].status).toBeDefined(); // Status mapping depends on internal util
      expect(result.summary).toHaveLength(1);
    });

    it('should handle missing dates gracefully', async () => {
      const mockWorkOrders = [
        {
          workOrderNumber: 'WO002',
          status: 'OPEN',
          deliveryDate: null,
          createdAt: new Date(),
        },
      ];

      (prisma.work_orders.findMany as any).mockResolvedValueOnce(
        mockWorkOrders,
      );
      (prisma.work_orders.count as any).mockResolvedValueOnce(1);
      (prisma.work_orders.findMany as any).mockResolvedValueOnce([]);

      const result = await WorkOrderService.getList({ page: 1, pageSize: 10 });
      expect(result.items[0].deliveryDate).toBeNull();
      expect(result.items[0].warrantyStatus).toBe('否');
    });
  });
});
