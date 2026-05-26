import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import {
  getNetPassRateSummaryByRange,
  getPassRateDrillDownByRange,
} from './pass-rate';

vi.mock('~/utils/prisma', () => ({
  default: {
    $queryRaw: vi.fn(),
    inspections: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
    quality_records: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('pass-rate quantity rule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calculates pass rate only by quantity and unqualifiedQuantity', async () => {
    (prisma.$queryRaw as any).mockResolvedValue([
      { passCount: 172n, totalCount: 180n },
    ]);

    const summary = await getNetPassRateSummaryByRange(
      new Date('2026-01-01'),
      new Date('2026-12-31'),
    );

    // totalCount = 100 + 80
    expect(summary.totalCount).toBe(180);
    // passCount = (100-8) + (80-0)
    expect(summary.passCount).toBe(172);
    expect(summary.passRate).toBe(95.56);
  });

  it('calculates issue-source pass rate by deducting issue quantities', async () => {
    (prisma.inspections.aggregate as any).mockResolvedValue({
      _sum: { quantity: 120 },
    });
    (prisma.quality_records.aggregate as any).mockResolvedValue({
      _sum: { quantity: 9 },
    });

    const summary = await getNetPassRateSummaryByRange(
      new Date('2026-01-01'),
      new Date('2026-12-31'),
      'issue',
    );

    expect(summary.totalCount).toBe(120);
    expect(summary.passCount).toBe(111);
    expect(summary.passRate).toBe(92.5);
  });

  it('deducts legacy issue rows from issue-source drilldown buckets', async () => {
    (prisma.inspections.findMany as any).mockResolvedValue([
      {
        category: 'PROCESS',
        incomingType: null,
        processName: '焊接',
        qualifiedQuantity: 100,
        quantity: 100,
        result: 'PASS',
        team: '外协结构',
        unqualifiedQuantity: 0,
      },
      {
        category: 'INCOMING',
        incomingType: '外购件',
        processName: null,
        qualifiedQuantity: 200,
        quantity: 200,
        result: 'PASS',
        team: null,
        unqualifiedQuantity: 0,
      },
    ]);
    (prisma.quality_records.findMany as any).mockResolvedValue([
      {
        category: null,
        inspection: null,
        processName: '焊接',
        quantity: 3,
        responsibleDepartment: '外协结构',
      },
      {
        category: '成品检验',
        inspection: null,
        processName: '成品检验',
        quantity: 5,
        responsibleDepartment: '采购部',
      },
    ]);

    const drillDown = await getPassRateDrillDownByRange(
      new Date('2026-04-01'),
      new Date('2026-04-30'),
      () => 99.85,
      'issue',
    );

    expect(drillDown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: '过程检验',
          passCount: 97,
          passRate: 97,
          process: '外协结构',
          totalCount: 100,
        }),
        expect.objectContaining({
          category: '进货检验',
          passCount: 195,
          passRate: 97.5,
          process: '外购件',
          totalCount: 200,
        }),
      ]),
    );
  });
});
