import { beforeEach, expect, it, vi } from 'vitest';

import { getMetrologyListPage } from '#/api/qms/metrology';

import { loadCalibrationInstrumentOptions } from './instrument-options';

vi.mock('#/api/qms/metrology', () => ({ getMetrologyListPage: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

it('uses paginated catalog reads and includes instruments after page one', async () => {
  vi.mocked(getMetrologyListPage)
    .mockResolvedValueOnce({
      items: [{ id: 'a', instrumentName: 'Gauge', instrumentCode: 'A' }],
      total: 2,
    } as never)
    .mockResolvedValueOnce({
      items: [{ id: 'b', instrumentName: 'Gauge', instrumentCode: 'B' }],
      total: 2,
    } as never);
  await expect(loadCalibrationInstrumentOptions()).resolves.toEqual([
    { label: 'Gauge / A', value: 'a' },
    { label: 'Gauge / B', value: 'b' },
  ]);
  expect(getMetrologyListPage).toHaveBeenNthCalledWith(2, {
    page: 2,
    pageSize: 100,
  });
});

it('fails instead of returning a truncated selector after a broken page', async () => {
  vi.mocked(getMetrologyListPage).mockResolvedValueOnce({
    items: [],
    total: 1,
  });
  await expect(loadCalibrationInstrumentOptions()).rejects.toThrow(
    'pagination did not advance',
  );
});
