import { ref } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import { useTrendLoader } from './useTrendLoader';

const { mockUseI18n, mockHandleApiError, mockMessageError } = vi.hoisted(
  () => ({
    mockHandleApiError: vi.fn(),
    mockMessageError: vi.fn(),
    mockUseI18n: vi.fn(() => ({ t: (key: string) => key })),
  }),
);

vi.mock('@vben/locales', () => ({
  useI18n: mockUseI18n,
}));

vi.mock('#/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({ handleApiError: mockHandleApiError }),
}));

vi.mock('ant-design-vue', () => ({
  message: { error: mockMessageError },
}));

vi.mock('@vueuse/core', () => ({
  useDebounceFn: (fn: any) => fn,
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual('vue');
  return { ...actual };
});

describe('useTrendLoader', () => {
  it('initializes with default data', () => {
    const requestFn = vi.fn();
    const granularity = ref<'month' | 'week'>('month');
    const { data, isLoading } = useTrendLoader(requestFn, granularity, 'init');
    expect(data.value).toBe('init');
    expect(isLoading.value).toBe(false);
  });

  it('loads data from requestFn on load()', async () => {
    const requestFn = vi.fn().mockResolvedValueOnce('result');
    const granularity = ref<'month' | 'week'>('month');
    const { data, load } = useTrendLoader(requestFn, granularity);

    await load();

    expect(data.value).toBe('result');
    expect(requestFn).toHaveBeenCalledWith('month', undefined);
  });

  it('caches results and returns cache on subsequent calls', async () => {
    const requestFn = vi.fn().mockResolvedValueOnce('data1');
    const granularity = ref<'month' | 'week'>('month');
    const { load } = useTrendLoader(requestFn, granularity);

    await load();
    await load();

    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  it('force refresh bypasses cache', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValueOnce('data1')
      .mockResolvedValueOnce('data2');
    const granularity = ref<'month' | 'week'>('month');
    const { data, load } = useTrendLoader(requestFn, granularity);

    await load();
    await load({ force: true });

    expect(requestFn).toHaveBeenCalledTimes(2);
    expect(data.value).toBe('data2');
  });

  it('does not cache when period is specified', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValueOnce('period-data')
      .mockResolvedValueOnce('period-data-2');
    const granularity = ref<'month' | 'week'>('month');
    const { load } = useTrendLoader(requestFn, granularity);

    await load({ period: '2026-01' });
    await load({ period: '2026-02' });

    expect(requestFn).toHaveBeenCalledTimes(2);
  });

  it('refresh forces a reload', async () => {
    const requestFn = vi
      .fn()
      .mockResolvedValueOnce('data1')
      .mockResolvedValueOnce('data2');
    const granularity = ref<'month' | 'week'>('month');
    const { data, refresh } = useTrendLoader(requestFn, granularity);

    await refresh();

    expect(data.value).toBe('data1');
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  it('shows error message on non-cancel errors', async () => {
    const error = new Error('network fail');
    const requestFn = vi.fn().mockRejectedValueOnce(error);
    const granularity = ref<'month' | 'week'>('month');
    const { load } = useTrendLoader(requestFn, granularity);

    await load();

    expect(mockMessageError).toHaveBeenCalledWith(
      'qms.dashboard.error.trendLoadFailed',
    );
    expect(mockHandleApiError).toHaveBeenCalledWith(
      error,
      expect.stringContaining('Dashboard Trend Load'),
    );
  });

  it('includes cache key suffix when provided', async () => {
    const requestFn = vi.fn().mockResolvedValueOnce('data');
    const granularity = ref<'month' | 'week'>('month');
    const { load } = useTrendLoader(
      requestFn,
      granularity,
      undefined,
      () => 'proj1',
    );

    await load();

    expect(requestFn).toHaveBeenCalledWith('month', undefined);
  });

  it('sets isLoading during request', async () => {
    let resolve: any;
    const requestFn = vi.fn().mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const granularity = ref<'month' | 'week'>('month');
    const { isLoading, load } = useTrendLoader(requestFn, granularity);

    const promise = load();
    expect(isLoading.value).toBe(true);

    resolve('done');
    await promise;

    expect(isLoading.value).toBe(false);
  });
});
