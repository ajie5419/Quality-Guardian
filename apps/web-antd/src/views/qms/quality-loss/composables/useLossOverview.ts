import type { QualityLossQueryParams } from '#/api/qms/quality-loss';

import { computed, ref } from 'vue';

import {
  getQualityLossCharts,
  getQualityLossDashboardSummary,
} from '#/api/qms/quality-loss';

type QualityLossCharts = import('#/api/qms/quality-loss').QualityLossCharts;
type QualityLossDashboardSummary =
  import('#/api/qms/quality-loss').QualityLossDashboardSummary;

type ApiErrorHandler = (error: unknown, operation: string) => void;

export function useLossOverview(handleApiError: ApiErrorHandler) {
  const currentYear = new Date().getFullYear();
  const selectedGranularity = ref<'month' | 'week' | 'year'>('month');
  const selectedYear = ref(currentYear);
  const yearOptions = ref<number[]>([currentYear]);
  const chartData = ref<null | QualityLossCharts>(null);
  const chartsAbortController = ref<AbortController | null>(null);
  const chartsRequestId = ref(0);
  const lastDashboardKey = ref('');
  const lastChartsKey = ref('');
  const summary = ref<QualityLossDashboardSummary['kpi']>({
    totalAmount: 0,
    totalClaim: 0,
    recoveryRate: 0,
    displayRate: '0%',
    pendingAmount: 0,
  });
  const currentFilters = ref<Omit<QualityLossQueryParams, 'page' | 'pageSize'>>(
    {},
  );

  const stats = computed(() => summary.value);

  function normalizeOverviewFilters(
    filters: Partial<QualityLossQueryParams> = {},
  ): Omit<QualityLossQueryParams, 'page' | 'pageSize'> {
    const normalized: Omit<QualityLossQueryParams, 'page' | 'pageSize'> = {};
    if (filters.lossSource) normalized.lossSource = filters.lossSource;
    if (filters.status) normalized.status = filters.status;
    if (filters.workOrderNumber) {
      normalized.workOrderNumber = filters.workOrderNumber;
    }
    if (filters.granularity) normalized.granularity = filters.granularity;
    if (typeof filters.year === 'number') normalized.year = filters.year;
    return normalized;
  }

  function buildFilterKey(
    filters: Omit<QualityLossQueryParams, 'page' | 'pageSize'>,
  ): string {
    return JSON.stringify({
      granularity: filters.granularity || '',
      lossSource: filters.lossSource || '',
      status: filters.status || '',
      workOrderNumber: filters.workOrderNumber || '',
    });
  }

  async function fetchDashboardSummary(
    filters: Partial<QualityLossQueryParams> = {},
    force = false,
  ) {
    try {
      const normalized = normalizeOverviewFilters(filters);
      const key = buildFilterKey(normalized);
      if (!force && key === lastDashboardKey.value) {
        return;
      }
      const data = await getQualityLossDashboardSummary({
        lossSource: normalized.lossSource,
        status: normalized.status,
        workOrderNumber: normalized.workOrderNumber,
      });
      lastDashboardKey.value = key;
      summary.value = data.kpi;
      yearOptions.value =
        data.years && data.years.length > 0 ? data.years : [currentYear];
      if (!yearOptions.value.includes(selectedYear.value)) {
        selectedYear.value = yearOptions.value[0] ?? currentYear;
      }
    } catch (error) {
      handleApiError(error, 'Fetch Quality Loss Dashboard Summary');
    }
  }

  async function fetchCharts(
    filters: Partial<QualityLossQueryParams> = {},
    year = selectedYear.value,
    force = false,
  ) {
    let controller: AbortController | null = null;
    try {
      const normalized = normalizeOverviewFilters(filters);
      const key = `${buildFilterKey(normalized)}|${selectedGranularity.value}|${year}`;
      if (!force && key === lastChartsKey.value) {
        return;
      }
      chartsAbortController.value?.abort();
      controller = new AbortController();
      chartsAbortController.value = controller;
      const requestId = ++chartsRequestId.value;
      const data = await getQualityLossCharts(
        {
          ...normalized,
          granularity: selectedGranularity.value,
          year,
        },
        controller.signal,
      );
      if (requestId !== chartsRequestId.value) {
        return;
      }
      lastChartsKey.value = key;
      chartData.value = data;
    } catch (error) {
      const requestError = error as {
        code?: string;
        message?: string;
        name?: string;
      };
      if (
        requestError.code === 'ERR_CANCELED' ||
        requestError.name === 'AbortError' ||
        requestError.name === 'CanceledError'
      ) {
        return;
      }
      handleApiError(error, 'Fetch Quality Loss Charts');
    } finally {
      if (chartsAbortController.value === controller) {
        chartsAbortController.value = null;
      }
    }
  }

  async function refreshOverview(
    filters: Partial<QualityLossQueryParams> = {},
    force = false,
  ) {
    const normalized = normalizeOverviewFilters(filters);
    currentFilters.value = normalized;
    await fetchDashboardSummary(normalized, force);
    await fetchCharts(normalized, selectedYear.value, force);
  }

  async function handleYearChange(year: number) {
    selectedYear.value = year;
    await fetchCharts(currentFilters.value, year);
  }

  async function handleGranularityChange(
    granularity: 'month' | 'week' | 'year',
  ) {
    selectedGranularity.value = granularity;
    await fetchCharts(currentFilters.value, selectedYear.value, true);
  }

  function invalidateOverviewCache() {
    chartsAbortController.value?.abort();
    chartsAbortController.value = null;
    chartsRequestId.value = 0;
    lastDashboardKey.value = '';
    lastChartsKey.value = '';
  }

  return {
    chartData,
    currentFilters,
    refreshOverview,
    invalidateOverviewCache,
    selectedGranularity,
    selectedYear,
    stats,
    yearOptions,
    handleGranularityChange,
    handleYearChange,
  };
}
