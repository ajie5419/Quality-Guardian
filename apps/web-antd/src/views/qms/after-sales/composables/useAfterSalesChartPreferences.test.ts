import { describe, expect, it, vi } from 'vitest';

import { useAfterSalesChartPreferences } from './useAfterSalesChartPreferences';

const {
  mockGetMergedPreferenceApi,
  mockSaveUserPreferenceApi,
  mockSaveSystemSettingApi,
  mockHandleApiError,
} = vi.hoisted(() => ({
  mockGetMergedPreferenceApi: vi.fn(),
  mockSaveUserPreferenceApi: vi.fn(),
  mockSaveSystemSettingApi: vi.fn(),
  mockHandleApiError: vi.fn(),
}));

vi.mock('#/api/system/preference', () => ({
  getMergedPreferenceApi: mockGetMergedPreferenceApi,
  saveSystemSettingApi: mockSaveSystemSettingApi,
  saveUserPreferenceApi: mockSaveUserPreferenceApi,
}));

vi.mock('#/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({ handleApiError: mockHandleApiError }),
}));

vi.mock('ant-design-vue', () => ({
  message: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual('vue');
  return { ...actual };
});

describe('useAfterSalesChartPreferences', () => {
  it('loadPreferences sets showCharts and customChartsData from API', async () => {
    mockGetMergedPreferenceApi.mockResolvedValueOnce({
      customCharts: [{ dimension: 'x', metric: 'y' }],
      showCharts: true,
    });

    const { loadPreferences, showCharts, customChartsData } =
      useAfterSalesChartPreferences();

    await loadPreferences();

    expect(showCharts.value).toBe(true);
    expect(customChartsData.value).toEqual([{ dimension: 'x', metric: 'y' }]);
  });

  it('loadPreferences normalizes non-array customCharts to empty array', async () => {
    mockGetMergedPreferenceApi.mockResolvedValueOnce({
      customCharts: 'not-an-array',
      showCharts: false,
    });

    const { loadPreferences, customChartsData } =
      useAfterSalesChartPreferences();

    await loadPreferences();

    expect(customChartsData.value).toEqual([]);
  });

  it('loadPreferences calls handleApiError on failure', async () => {
    const error = new Error('API fail');
    mockGetMergedPreferenceApi.mockRejectedValueOnce(error);

    const { loadPreferences } = useAfterSalesChartPreferences();
    await loadPreferences();

    expect(mockHandleApiError).toHaveBeenCalledWith(
      error,
      'Load After Sales Chart Preferences',
    );
  });

  it('loadPreferences fetches and sets state from API', async () => {
    mockGetMergedPreferenceApi.mockResolvedValueOnce(null);

    const { loadPreferences } = useAfterSalesChartPreferences();
    await loadPreferences();

    expect(mockGetMergedPreferenceApi).toHaveBeenCalledWith(
      'after-sales-charts',
      'qms:after_sales:default_charts',
    );
  });

  it('handleSaveSystemDefault calls saveSystemSettingApi', async () => {
    const { handleSaveSystemDefault } = useAfterSalesChartPreferences();
    await handleSaveSystemDefault();
    expect(mockSaveSystemSettingApi).toHaveBeenCalledWith(
      'qms:after_sales:default_charts',
      { customCharts: [], showCharts: false },
    );
  });

  it('handleSaveSystemDefault calls handleApiError on failure', async () => {
    const error = new Error('save fail');
    mockSaveSystemSettingApi.mockRejectedValueOnce(error);

    const { handleSaveSystemDefault } = useAfterSalesChartPreferences();
    await handleSaveSystemDefault();

    expect(mockHandleApiError).toHaveBeenCalledWith(
      error,
      'Save After Sales Chart System Default',
    );
  });
});
