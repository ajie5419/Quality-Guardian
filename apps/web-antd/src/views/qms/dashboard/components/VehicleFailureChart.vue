<script lang="ts" setup>
import type { Dayjs } from 'dayjs';

import type { EchartsUIType } from '@vben/plugins/echarts';

import type { EChartsColorParams } from '#/types/common';

import { nextTick, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { tryOnUnmounted } from '@vueuse/core';
import {
  Button,
  DatePicker,
  InputNumber,
  message,
  Modal,
  Spin,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  getVehicleFailureRate,
  setVehicleFailureManualData,
} from '#/api/qms/dashboard';
import { useErrorHandler } from '#/hooks/useErrorHandler';

/**
 * 缺陷类型排行数据项
 */
interface RankingItem {
  count: number;
  defectType: string;
  percentage: number;
}

/**
 * 趋势数据项
 */
interface TrendItem {
  currentYear: number;
  lastYear: number;
  lastYearManual: null | number;
  period: string;
}

interface YearSeriesItem {
  manualOverrides: boolean[];
  values: number[];
  year: number;
}

interface ManualRow {
  count: number;
  month: string;
  warrantyVehicleCount: number;
}

interface YearWarrantySeriesItem {
  manualOverrides: boolean[];
  values: number[];
  year: number;
}

interface Props {
  active?: boolean;
}

const props = defineProps<Props>();
const { t } = useI18n();
const { handleApiError } = useErrorHandler();

const rankingChartRef = ref<EchartsUIType>();
const trendChartRef = ref<EchartsUIType>();

const {
  renderEcharts: renderRanking,
  resize: resizeRanking,
  getChartInstance: getRankingInstance,
} = useEcharts(rankingChartRef);
const { renderEcharts: renderTrend, resize: resizeTrend } =
  useEcharts(trendChartRef);

const loading = ref(false);
const savingManual = ref(false);
const manualModalVisible = ref(false);
const manualRows = ref<ManualRow[]>([]);
const rankingData = ref<RankingItem[]>([]);
const trendData = ref<TrendItem[]>([]);
const yearSeriesData = ref<YearSeriesItem[]>([]);
const yearWarrantySeriesData = ref<YearWarrantySeriesItem[]>([]);
const selectedMonth = ref<Dayjs>(dayjs());

const YEAR_COLORS = ['#1677ff', '#13c2c2', '#52c41a', '#fa8c16', '#eb2f96'];

function normalizeRankingItem(item: unknown): RankingItem {
  const normalized = item as Record<string, number | string>;
  return {
    count: Number(normalized.count || 0),
    defectType: String(normalized.defectType || '未分类'),
    percentage: Number(normalized.percentage || 0),
  };
}

function normalizeTrendItem(item: unknown): TrendItem {
  const normalized = item as Record<string, null | number | string>;
  const manualValue = normalized.lastYearManual;

  return {
    currentYear: Number(normalized.currentYear || 0),
    lastYear: Number(normalized.lastYear || 0),
    lastYearManual:
      typeof manualValue === 'number' && Number.isFinite(manualValue)
        ? manualValue
        : null,
    period: String(normalized.period || ''),
  };
}

function normalizeYearSeriesItem(item: unknown): YearSeriesItem {
  const normalized = item as Record<string, unknown>;
  const year = Number(normalized.year || 0);
  const values = Array.isArray(normalized.values)
    ? normalized.values.map((value) => Number(value || 0))
    : [];
  const manualOverrides = Array.isArray(normalized.manualOverrides)
    ? normalized.manualOverrides.map(Boolean)
    : values.map(() => false);

  return {
    manualOverrides,
    values,
    year,
  };
}

function normalizeYearWarrantySeriesItem(
  item: unknown,
): YearWarrantySeriesItem {
  const normalized = item as Record<string, unknown>;
  const year = Number(normalized.year || 0);
  const values = Array.isArray(normalized.values)
    ? normalized.values.map((value) => Number(value || 0))
    : [];
  const manualOverrides = Array.isArray(normalized.manualOverrides)
    ? normalized.manualOverrides.map(Boolean)
    : values.map(() => false);

  return {
    manualOverrides,
    values,
    year,
  };
}

async function fetchData() {
  loading.value = true;
  try {
    const res = await getVehicleFailureRate({
      month: selectedMonth.value.format('YYYY-MM'),
    });

    if (res) {
      rankingData.value = (res.ranking || []).map((item) =>
        normalizeRankingItem(item as unknown),
      );
      trendData.value = (res.trend || []).map((item) =>
        normalizeTrendItem(item as unknown),
      );
      yearSeriesData.value = (res.yearSeries || []).map((item: unknown) =>
        normalizeYearSeriesItem(item as unknown),
      );
      yearWarrantySeriesData.value = (res.yearWarrantySeries || []).map(
        (item: unknown) => normalizeYearWarrantySeriesItem(item),
      );
      if (yearSeriesData.value.length === 0) {
        yearSeriesData.value = buildFallbackYearSeries();
      }
    } else {
      rankingData.value = [];
      trendData.value = [];
      yearSeriesData.value = [];
      yearWarrantySeriesData.value = [];
    }

    updateCharts();
  } catch (error) {
    handleApiError(error, 'Load Vehicle Feedback Data');
  } finally {
    loading.value = false;
  }
}

function getEffectiveLastYear(item: TrendItem) {
  return item.lastYearManual ?? item.lastYear;
}

function getLastYearMonth(period: string) {
  const parsed = dayjs(period, 'YYYY-MM');
  return parsed.isValid() ? parsed.subtract(1, 'year').format('YYYY-MM') : '';
}

function getYearLabel(year: number) {
  return `${year}`;
}

function getCumulativeIssueCount(values: number[], endIndex: number) {
  return getCumulativeValue(values, endIndex);
}

function getCumulativeValue(values: number[], endIndex: number) {
  let total = 0;
  for (let index = 0; index <= endIndex; index += 1) {
    total += Number(values[index] || 0);
  }
  return total;
}

function getAverageValue(values: number[], endIndex: number) {
  const months = endIndex + 1;
  if (months <= 0) {
    return 0;
  }
  return Number((getCumulativeValue(values, endIndex) / months).toFixed(3));
}

function getIntensityPercent(issueCount: number, warrantyVehicleCount: number) {
  if (warrantyVehicleCount <= 0) {
    return 0;
  }
  return Number(((issueCount / warrantyVehicleCount) * 100).toFixed(1));
}

function getYearWarrantySeries(year: number) {
  return yearWarrantySeriesData.value.find((item) => item.year === year);
}

function buildFallbackYearSeries(): YearSeriesItem[] {
  const selectedYear = selectedMonth.value.year();
  const previousYear = selectedYear - 1;
  const periods = trendData.value;
  return [
    {
      manualOverrides: periods.map(() => false),
      values: periods.map((item) => item.currentYear),
      year: selectedYear,
    },
    {
      manualOverrides: periods.map((item) => item.lastYearManual !== null),
      values: periods.map((item) => getEffectiveLastYear(item)),
      year: previousYear,
    },
  ];
}

function updateCharts() {
  if (!props.active) return;

  const rankingOption = {
    title: {
      text: t('qms.dashboard.vehicleFailureRateRanking'),
      left: 'center',
      textStyle: { fontSize: 14 },
    },
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      formatter: (params: unknown) => {
        const [first] = params as Array<{ data: number; name: string }>;
        const item = rankingData.value.find(
          (entry) => entry.defectType === first?.name,
        );
        if (!item) {
          return '';
        }
        return [
          `${item.defectType}`,
          `${t('qms.dashboard.failedVehicles')}: ${item.count}`,
          `占比: ${item.percentage}%`,
        ].join('<br/>');
      },
    },
    grid: { left: '3%', right: '10%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'value' as const,
      name: t('qms.dashboard.failedVehicles'),
    },
    yAxis: {
      type: 'category' as const,
      data: rankingData.value.map((i) => i.defectType).reverse(),
    },
    series: [
      {
        name: t('qms.dashboard.failedVehicles'),
        type: 'bar' as const,
        data: rankingData.value.map((i) => i.count).reverse(),
        itemStyle: {
          color: (params: EChartsColorParams) => {
            return (params.dataIndex || 0) % 2 === 0 ? '#5ab1ef' : '#69c0ff';
          },
        },
        label: { show: true, position: 'right' as const },
        barMaxWidth: 18,
      },
    ],
  };
  renderRanking(rankingOption).then(() => {
    const instance = getRankingInstance();
    if (instance) {
      instance.off('click');
      instance.getZr().setCursorStyle('default');
    }
  });

  const selectedYearValue = selectedMonth.value.year();
  const periodLabels = trendData.value.map((i) => i.period);
  const sortedSeries = [...yearSeriesData.value].sort(
    (a, b) => a.year - b.year,
  );
  const trendOption = {
    title: {
      text: t('qms.dashboard.overallVehicleFailureRateTrend'),
      left: 'center',
      top: 8,
      subtext: t('qms.dashboard.yearToMonthByVehicle'),
      textStyle: { fontSize: 14 },
    },
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'cross' as const },
      formatter: (params: unknown) => {
        const seriesParams = params as Array<{
          data: number;
          marker: string;
          seriesName: string;
        }>;
        if (seriesParams.length === 0) {
          return '';
        }
        const dataIndex = Number(
          (params as Array<{ dataIndex: number }>)[0]?.dataIndex || 0,
        );
        const period = periodLabels[dataIndex] || '';
        const lines = [period];
        const sortedByYear = [...seriesParams].sort(
          (a, b) => Number(b.seriesName) - Number(a.seriesName),
        );

        for (const item of sortedByYear) {
          const year = Number(item.seriesName);
          const currentSeries = sortedSeries.find(
            (series) => series.year === year,
          );
          const currentWarrantySeries = getYearWarrantySeries(year);
          const usedManual = Boolean(currentSeries?.manualOverrides[dataIndex]);
          const monthIssueCount = Number(currentSeries?.values[dataIndex] || 0);
          const cumulativeIssueCount = currentSeries
            ? getCumulativeIssueCount(currentSeries.values, dataIndex)
            : 0;
          const monthWarrantyCount = Number(
            currentWarrantySeries?.values[dataIndex] || 0,
          );
          const ytdAverageWarrantyCount = currentWarrantySeries
            ? getAverageValue(currentWarrantySeries.values, dataIndex)
            : 0;
          const intensityPct = getIntensityPercent(
            cumulativeIssueCount,
            ytdAverageWarrantyCount,
          );
          lines.push(
            `${item.marker}${item.seriesName}: ${Number(item.data || 0)}%${usedManual ? ' (manual)' : ''}`,
            `Month issues: ${monthIssueCount}, Month warranty: ${monthWarrantyCount}, YTD ${cumulativeIssueCount}/${ytdAverageWarrantyCount} = ${intensityPct}%`,
          );
        }

        return lines.join('<br/>');
      },
    },
    legend: {
      data: sortedSeries.map((item) => getYearLabel(item.year)),
      type: 'scroll' as const,
      top: 58,
      left: 40,
      right: 40,
    },
    grid: {
      left: '3%',
      right: '4%',
      top: 116,
      bottom: '10%',
      containLabel: true,
    },
    xAxis: {
      type: 'category' as const,
      data: periodLabels,
    },
    yAxis: {
      type: 'value' as const,
      name: '%',
      min: 0,
    },
    series: sortedSeries.map((series, index) => {
      const color = YEAR_COLORS[index % YEAR_COLORS.length] || '#1677ff';
      const isSelectedYear = series.year === selectedYearValue;
      const warrantySeries = getYearWarrantySeries(series.year);
      return {
        name: getYearLabel(series.year),
        type: 'line' as const,
        data: series.values.map((_, dataIndex) =>
          getIntensityPercent(
            getCumulativeIssueCount(series.values, dataIndex),
            warrantySeries
              ? getAverageValue(warrantySeries.values, dataIndex)
              : 0,
          ),
        ),
        itemStyle: { color },
        lineStyle: {
          color,
          type: isSelectedYear ? ('solid' as const) : ('dashed' as const),
          width: isSelectedYear ? 3 : 2,
        },
        smooth: true,
      };
    }),
  };
  renderTrend(trendOption);
}

function openManualModal() {
  manualRows.value = trendData.value
    .map((item) => ({
      count: getEffectiveLastYear(item),
      month: getLastYearMonth(item.period),
      warrantyVehicleCount: 0,
    }))
    .filter((item) => item.month)
    .map((item) => {
      const parsed = dayjs(item.month, 'YYYY-MM');
      const monthIndex = parsed.isValid() ? parsed.month() : -1;
      const targetYear = parsed.isValid() ? parsed.year() : 0;
      const warrantySeries = getYearWarrantySeries(targetYear);
      const warrantyVehicleCount =
        monthIndex >= 0 ? Number(warrantySeries?.values[monthIndex] || 0) : 0;

      return {
        ...item,
        warrantyVehicleCount,
      };
    });
  manualModalVisible.value = true;
}

async function saveManualData() {
  savingManual.value = true;
  try {
    await Promise.all(
      manualRows.value.map((row) =>
        setVehicleFailureManualData({
          count: row.count,
          month: row.month,
          warrantyVehicleCount: row.warrantyVehicleCount,
        }),
      ),
    );
    message.success(t('qms.common.saveSuccess'));
    manualModalVisible.value = false;
    await fetchData();
  } catch (error) {
    handleApiError(error, 'Save Vehicle Feedback Manual Data');
  } finally {
    savingManual.value = false;
  }
}

watch(
  () => props.active,
  (val) => {
    if (val) {
      fetchData();
      nextTick(() => {
        setTimeout(() => {
          resizeRanking();
          resizeTrend();
        }, 200);
      });
    }
  },
  { immediate: true },
);

watch(selectedMonth, () => {
  if (!props.active) {
    return;
  }
  fetchData();
});

tryOnUnmounted(() => {
  if (getRankingInstance()) {
    getRankingInstance()?.dispose();
  }
});
</script>

<template>
  <div
    class="relative flex h-[360px] w-full min-w-0 flex-col gap-4 overflow-hidden md:flex-row"
  >
    <div
      v-if="loading"
      class="absolute inset-0 z-10 flex items-center justify-center bg-white/50"
    >
      <Spin />
    </div>

    <!-- Ranking List (Left) -->
    <div
      class="relative h-full w-full min-w-0 border-r border-gray-100 pr-2 md:w-1/3"
    >
      <div class="mb-2 flex items-center justify-end">
        <DatePicker
          v-model:value="selectedMonth"
          picker="month"
          :allow-clear="false"
          size="small"
          style="width: 140px"
        />
      </div>
      <EchartsUI ref="rankingChartRef" width="100%" height="100%" />
    </div>

    <!-- Trend Chart (Right) -->
    <div class="h-full w-full min-w-0 pl-2 md:w-2/3">
      <div class="mb-2 flex items-center justify-end">
        <Button size="small" @click="openManualModal">
          {{ t('qms.dashboard.lastYearManual') }}
        </Button>
      </div>
      <EchartsUI ref="trendChartRef" width="100%" height="100%" />
    </div>

    <Modal
      v-model:open="manualModalVisible"
      :title="t('qms.dashboard.lastYearManual')"
      :confirm-loading="savingManual"
      @ok="saveManualData"
    >
      <div class="flex flex-col gap-3">
        <div
          v-for="row in manualRows"
          :key="row.month"
          class="flex items-center justify-between gap-4"
        >
          <span class="text-sm text-gray-600">{{ row.month }}</span>
          <div class="flex items-center gap-2">
            <InputNumber
              v-model:value="row.count"
              :min="0"
              :precision="0"
              class="w-28"
              placeholder="问题数"
            />
            <InputNumber
              v-model:value="row.warrantyVehicleCount"
              :min="0"
              :precision="0"
              class="w-28"
              placeholder="再保数"
            />
          </div>
        </div>
      </div>
    </Modal>
  </div>
</template>
