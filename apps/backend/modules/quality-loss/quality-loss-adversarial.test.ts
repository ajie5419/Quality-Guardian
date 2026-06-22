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

vi.mock('~/modules/dept/dept-tree', () => ({
  flattenDeptTree: () => [],
}));

vi.mock('~/modules/dept/dept.service', () => ({
  DeptService: { findAll: vi.fn().mockResolvedValue([]) },
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

describe('qualityLossService — index read-path adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.quality_loss_index.findMany as any).mockResolvedValue([]);
    (prisma.quality_loss_index.count as any).mockResolvedValue(0);
  });

  describe('pagination clamping', () => {
    it('defaults page=1 pageSize=20', async () => {
      await QualityLossService.getAllLosses({});
      expect(prisma.quality_loss_index.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('clamps page=0 to page=1', async () => {
      await QualityLossService.getAllLosses({ page: 0 });
      expect(prisma.quality_loss_index.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0 }),
      );
    });

    it('clamps pageSize=0 to 1', async () => {
      await QualityLossService.getAllLosses({ page: 1, pageSize: 0 });
      expect(prisma.quality_loss_index.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1 }),
      );
    });

    it('caps pageSize at 100', async () => {
      await QualityLossService.getAllLosses({ page: 1, pageSize: 999_999 });
      expect(prisma.quality_loss_index.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('returns empty array when page is beyond data range', async () => {
      (prisma.quality_loss_index.findMany as any).mockResolvedValueOnce([]);
      (prisma.quality_loss_index.count as any).mockResolvedValueOnce(0);
      const result = await QualityLossService.getAllLosses({
        page: 999,
        pageSize: 20,
      });
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('source filter', () => {
    it('passes lossSource through to the where clause', async () => {
      await QualityLossService.getAllLosses({ lossSource: 'Internal' });
      expect(prisma.quality_loss_index.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ source: 'Internal' }),
        }),
      );
    });

    it('omits source when no lossSource is provided', async () => {
      await QualityLossService.getAllLosses({});
      const arg = (prisma.quality_loss_index.findMany as any).mock.calls[0][0];
      expect(arg.where).not.toHaveProperty('source');
    });
  });

  describe('work-order filter', () => {
    it('uses contains match on workOrderNumber', async () => {
      await QualityLossService.getAllLosses({ workOrderNumber: 'WO-42' });
      expect(prisma.quality_loss_index.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workOrderNumber: { contains: 'WO-42' },
          }),
        }),
      );
    });
  });

  describe('row mapping', () => {
    it('preserves the indexed source label and amount', async () => {
      (prisma.quality_loss_index.findMany as any).mockResolvedValue([
        indexRow({
          id: 'EXT-as-9',
          source: 'External',
          amount: 350,
          actualClaim: 100,
        }),
      ]);
      (prisma.quality_loss_index.count as any).mockResolvedValue(1);

      const result = await QualityLossService.getAllLosses({});
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.lossSource).toBe('External');
      expect(result.items[0]?.amount).toBe(350);
      expect(result.items[0]?.actualClaim).toBe(100);
    });
  });
});
