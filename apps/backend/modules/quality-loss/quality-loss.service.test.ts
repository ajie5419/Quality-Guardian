import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QualityLossService } from '~/modules/quality-loss/quality-loss.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    quality_loss_index: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('~/modules/data-scope/data-scope.service', () => ({
  DataScopeService: {
    buildQualityLossIndexWhere: vi.fn(async (where: unknown) => where),
  },
}));

vi.mock('~/modules/dept/dept.service', () => ({
  DeptService: {
    findAll: vi.fn(async () => []),
  },
}));

vi.mock('~/modules/dept/dept-tree', () => ({
  flattenDeptTree: () => [],
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('@qgs/shared', async () => {
  const actual =
    await vi.importActual<typeof import('@qgs/shared')>('@qgs/shared');
  return {
    ...actual,
    isValidQualityLossStatus: (status: string) =>
      ['CONFIRMED', 'PENDING', 'PROCESSING', 'RESOLVED'].includes(
        String(status || '')
          .trim()
          .toUpperCase(),
      ),
  };
});

function indexRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    actualClaim: 0,
    amount: 100,
    createdBy: 'system',
    description: null,
    id: 'EXT-as-1',
    indexedAt: new Date('2024-01-01'),
    isDeleted: false,
    occurDate: new Date('2024-01-01'),
    partName: 'Bolt',
    projectName: 'P',
    respDept: 'QA',
    source: 'External',
    sourcePk: 'as-1',
    status: 'OPEN',
    workOrderNumber: 'WO-1',
    ...overrides,
  };
}

describe('qualityLossService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllLosses', () => {
    it('serves rows from quality_loss_index with DB pagination', async () => {
      (prisma.quality_loss_index.findMany as any).mockResolvedValue([
        indexRow({ id: 'EXT-as-1', source: 'External', amount: 350 }),
        indexRow({
          id: 'INT-qr-1',
          source: 'Internal',
          sourcePk: 'qr-1',
          amount: 200,
        }),
      ]);
      (prisma.quality_loss_index.count as any).mockResolvedValue(2);

      const result = await QualityLossService.getAllLosses();

      expect(prisma.quality_loss_index.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isDeleted: false }),
          orderBy: { occurDate: 'desc' },
        }),
      );
      expect(result.total).toBe(2);
      expect(result.items.map((item) => item.lossSource).sort()).toEqual([
        'External',
        'Internal',
      ]);
    });

    it('applies lossSource filter to where clause', async () => {
      (prisma.quality_loss_index.findMany as any).mockResolvedValue([]);
      (prisma.quality_loss_index.count as any).mockResolvedValue(0);

      await QualityLossService.getAllLosses({ lossSource: 'External' });

      expect(prisma.quality_loss_index.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ source: 'External' }),
        }),
      );
    });
  });

  describe('getTrendData', () => {
    it('should handle trend data aggregation', async () => {
      (prisma.$queryRaw as any)
        .mockResolvedValueOnce([{ p: 1, a: 100 }]) // manual
        .mockResolvedValueOnce([{ p: 1, a: 200 }]) // internal
        .mockResolvedValueOnce([{ p: 1, a: 300 }]) // external
        .mockResolvedValueOnce([{ p: 1, a: 50 }]); // commissioning

      const result = await QualityLossService.getTrendData('month');

      const jan = result.trend.find(
        (t) => t.period === '1月' || t.period === 'Jan',
      );
      expect(jan).toBeDefined();
      expect(jan?.totalAmount).toBe(650);
      expect(jan?.manualAmount).toBe(100);
      expect(jan?.internalAmount).toBe(200);
      expect(jan?.externalAmount).toBe(300);
      expect(jan?.commissioningAmount).toBe(50);
    });

    it('should handle BigInt period and sum values', async () => {
      (prisma.$queryRaw as any)
        .mockResolvedValueOnce([{ p: BigInt(5), a: BigInt(1000) }])
        .mockResolvedValueOnce([{ p: BigInt(5), a: BigInt(2000) }])
        .mockResolvedValueOnce([{ p: BigInt(5), a: BigInt(3000) }])
        .mockResolvedValueOnce([{ p: BigInt(5), a: BigInt(500) }]);

      const result = await QualityLossService.getTrendData('week');
      const w5 = result.trend.find((t) => t.period === 'W5');
      expect(w5).toBeDefined();
      expect(w5?.totalAmount).toBe(6500);
    });
  });
});
