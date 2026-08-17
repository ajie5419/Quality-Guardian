import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  clearAvailableYearsCache,
  getAvailableYears,
} from './available-years.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    $queryRawUnsafe: vi.fn(),
  },
}));

describe('available years service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAvailableYearsCache();
  });

  it('merges distinct years from all sources in descending order', async () => {
    vi.mocked(prisma.$queryRawUnsafe)
      .mockResolvedValueOnce([{ year: 2026 }, { year: 2024 }])
      .mockResolvedValueOnce([{ year: 2025 }])
      .mockResolvedValueOnce([{ year: 2026 }, { year: 2023 }])
      .mockResolvedValueOnce([{ year: 2022 }])
      .mockResolvedValueOnce([{ year: 2021 }])
      .mockResolvedValueOnce([{ year: 2024 }])
      .mockResolvedValueOnce([{ year: 2026 }]);

    const years = await getAvailableYears();

    expect(years).toEqual([2026, 2025, 2024, 2023, 2022, 2021]);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(7);
  });

  it('filters sources by scopes', async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([{ year: 2026 }]);

    await getAvailableYears(['after-sales', 'work-order']);

    const calls = vi.mocked(prisma.$queryRawUnsafe).mock.calls;
    expect(calls).toHaveLength(2);
    const sqls = calls.map((call) => String(call[0]));
    expect(sqls.some((sql) => sql.includes('after_sales'))).toBe(true);
    expect(sqls.some((sql) => sql.includes('work_orders'))).toBe(true);
    expect(sqls.some((sql) => sql.includes('quality_records'))).toBe(false);
  });

  it('returns empty array for unknown scopes', async () => {
    const years = await getAvailableYears(['unknown-scope']);
    expect(years).toEqual([]);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('caches within TTL and skips expired cache', async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([{ year: 2026 }]);

    await getAvailableYears();
    await getAvailableYears();
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(7); // second call cached

    clearAvailableYearsCache();
    await getAvailableYears();
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(14); // cache cleared
  });
});
