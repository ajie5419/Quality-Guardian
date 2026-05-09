import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { getNetPassRateSummaryByRange } from './pass-rate';

vi.mock('~/utils/prisma', () => ({
  default: {
    $queryRaw: vi.fn(),
    inspections: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
    quality_records: {
      aggregate: vi.fn(),
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
});
