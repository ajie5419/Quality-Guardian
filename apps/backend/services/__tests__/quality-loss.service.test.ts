import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '../../utils/prisma';
import { QualityLossService } from '../quality-loss.service';

// Mock prisma and logger
vi.mock('../../utils/prisma', () => ({
  default: {
    quality_losses: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    quality_records: {
      findMany: vi.fn(),
    },
    after_sales: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('qualityLossService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllLosses', () => {
    it('should correctly merge and format items from different sources', async () => {
      // Mock Manual Loss
      (prisma.quality_losses.findMany as any).mockResolvedValue([
        {
          id: 'manual-1',
          lossId: 'M001',
          occurDate: new Date('2024-01-01'),
          amount: '100.00',
          actualClaim: '50.00',
          respDept: 'Production',
          type: 'Material',
          status: 'Pending',
          isDeleted: false,
        },
      ]);

      // Mock Internal Loss
      (prisma.quality_records.findMany as any).mockResolvedValue([
        {
          id: 'internal-1',
          serialNumber: 101,
          date: new Date('2024-01-02'),
          lossAmount: '200.00',
          recoveredAmount: '150.00',
          responsibleDepartment: 'QC',
          partName: 'Engine',
          projectName: 'Project A',
          workOrderNumber: 'WO001',
          status: 'CLOSED',
          isDeleted: false,
          createdAt: new Date(),
        },
      ]);

      // Mock External Loss
      (prisma.after_sales.findMany as any).mockResolvedValue([
        {
          id: 'external-1',
          serialNumber: 201,
          occurDate: new Date('2024-01-03'),
          materialCost: '300.00',
          laborTravelCost: '50.00',
          actualClaim: '200.00',
          respDept: 'Service',
          partName: 'Bolt',
          projectName: 'Project B',
          workOrderNumber: 'WO002',
          claimStatus: 'CLOSED',
          isDeleted: false,
          createdAt: new Date(),
        },
      ]);

      const result = await QualityLossService.getAllLosses();

      expect(result.total).toBe(3);

      // Check individual mapping
      const manual = result.items.find((i) => i.lossSource === 'Manual');
      expect(manual?.amount).toBe(100);
      expect(manual?.id).toBe('M001');

      const internal = result.items.find((i) => i.lossSource === 'Internal');
      expect(internal?.amount).toBe(200);
      expect(internal?.id).toBe('INT-101');

      const external = result.items.find((i) => i.lossSource === 'External');
      expect(external?.amount).toBe(350); // 300 + 50
      expect(external?.id).toBe('EXT-201');
    });

    it('should handle empty results gracefully', async () => {
      (prisma.quality_losses.findMany as any).mockResolvedValue([]);
      (prisma.quality_records.findMany as any).mockResolvedValue([]);
      (prisma.after_sales.findMany as any).mockResolvedValue([]);

      const result = await QualityLossService.getAllLosses();
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getTrendData', () => {
    it('should handle trend data aggregation', async () => {
      (prisma.$queryRaw as any)
        .mockResolvedValueOnce([{ p: 1, a: 100 }]) // manual
        .mockResolvedValueOnce([{ p: 1, a: 200 }]) // internal
        .mockResolvedValueOnce([{ p: 1, a: 300 }]); // external

      const result = await QualityLossService.getTrendData('month');

      const jan = result.trend.find(
        (t) => t.period === '1月' || t.period === 'Jan',
      );
      expect(jan).toBeDefined();
      expect(jan?.totalAmount).toBe(600);
      expect(jan?.manualAmount).toBe(100);
      expect(jan?.internalAmount).toBe(200);
      expect(jan?.externalAmount).toBe(300);
    });

    it('should handle BigInt period and sum values', async () => {
      (prisma.$queryRaw as any)
        .mockResolvedValueOnce([{ p: BigInt(5), a: BigInt(1000) }]) // manual
        .mockResolvedValueOnce([{ p: BigInt(5), a: BigInt(2000) }]) // internal
        .mockResolvedValueOnce([{ p: BigInt(5), a: BigInt(3000) }]); // external

      const result = await QualityLossService.getTrendData('week');
      const w5 = result.trend.find((t) => t.period === 'W5');
      expect(w5).toBeDefined();
      expect(w5?.totalAmount).toBe(6000);
      expect(w5?.manualAmount).toBe(1000);
      expect(w5?.internalAmount).toBe(2000);
      expect(w5?.externalAmount).toBe(3000);
    });
  });
});
