import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it, vi } from 'vitest';
import {
  buildIndexWhere,
  buildManualLossesWhere,
  formatIndexRow,
  formatTrendItem,
  getWeekOfYear,
  mergeTrendData,
  normalizeLossSourceFilter,
} from '~/modules/quality-loss/quality-loss-format';

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

describe('quality-loss format helpers', () => {
  it('builds manual loss filters by normalized status and year range', () => {
    const where = buildManualLossesWhere({
      status: 'confirmed',
      year: 2026,
    });

    expect(where).toEqual({
      isDeleted: false,
      occurDate: {
        gte: new Date('2026-01-01T00:00:00.000Z'),
        lte: new Date('2026-12-31T23:59:59.999Z'),
      },
      status: 'Confirmed',
    });
  });

  it('builds index where with workOrder + lossSource + year filters', () => {
    const where = buildIndexWhere({
      lossSource: 'External',
      workOrderNumber: 'WO-42',
      year: 2026,
    });

    expect(where).toEqual({
      isDeleted: false,
      source: 'External',
      workOrderNumber: { contains: 'WO-42' },
      occurDate: {
        gte: new Date('2026-01-01T00:00:00.000Z'),
        lte: new Date('2026-12-31T23:59:59.999Z'),
      },
    });
  });

  it('formats an index row into a QualityLossItem with normalized status', () => {
    const row = formatIndexRow({
      actualClaim: new Decimal(20),
      amount: new Decimal(150),
      createdBy: 'u-1',
      description: null,
      id: 'EXT-as-1',
      indexedAt: new Date('2026-01-01T00:00:00.000Z'),
      occurDate: new Date('2026-01-01T00:00:00.000Z'),
      partName: 'Bolt',
      projectName: 'Project',
      respDept: 'QA',
      source: 'External',
      sourcePk: 'as-1',
      status: 'CLOSED',
      workOrderNumber: 'WO-1',
    });

    expect(row).toEqual(
      expect.objectContaining({
        actualClaim: 20,
        amount: 150,
        id: 'EXT-as-1',
        lossSource: 'External',
        partName: 'Bolt',
        pk: 'as-1',
        projectName: 'Project',
        status: 'Confirmed',
        workOrderNumber: 'WO-1',
      }),
    );
  });

  it('normalizes source filters and calculates week number', () => {
    expect(getWeekOfYear(new Date('2026-01-01T00:00:00.000Z'))).toBe(1);
    expect(normalizeLossSourceFilter('manual')).toBe('Manual');
    expect(normalizeLossSourceFilter('unknown')).toBe('Manual');
  });

  it('merges trend rows and formats trend totals', () => {
    const merged = mergeTrendData(
      [{ a: new Decimal(10), p: 1 }],
      [{ a: 20, p: 1 }],
      [{ a: 30n, p: 2 }],
      [
        { a: 5, p: 0 },
        { a: 40, p: 1 },
      ],
      'month',
    );

    expect([...merged.keys()].sort()).toEqual([1, 2]);
    const monthOne = merged.get(1);
    expect(monthOne).toBeDefined();
    expect(
      formatTrendItem('Jan', monthOne as NonNullable<typeof monthOne>),
    ).toEqual({
      commissioningAmount: 40,
      externalAmount: 0,
      internalAmount: 20,
      manualAmount: 10,
      period: 'Jan',
      totalAmount: 70,
    });
  });

  it('keeps period zero for weekly trend data', () => {
    const merged = mergeTrendData([{ a: 10, p: 0 }], [], [], [], 'week');

    expect(merged.get(0)?.manual).toBe(10);
  });
});
