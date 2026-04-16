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

interface ManualRow {
  count: number;
  month: string;
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
const selectedMonth = ref<Dayjs>(dayjs());

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
    } else {
      rankingData.value = [];
      trendData.value = [];
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

  const trendOption = {
    title: {
      text: t('qms.dashboard.overallVehicleFailureRateTrend'),
      left: 'center',
      subtext: t('qms.dashboard.yearToMonthByVehicle'),
      textStyle: { fontSize: 14 },
    },
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'cross' as const },
      formatter: (params: unknown) => {
        const seriesParams = params as Array<{ name: string }>;
        const period = seriesParams[0]?.name;
        const item = trendData.value.find((entry) => entry.period === period);
        if (!item) {
          return '';
        }
        return [
          `${item.period}`,
          `${t('qms.dashboard.currentYearData')}: ${item.currentYear}`,
          `${t('qms.dashboard.lastYearData')}: ${getEffectiveLastYear(item)}`,
          item.lastYearManual === null
            ? ''
            : `${t('qms.dashboard.lastYearManual')}: ${item.lastYearManual}`,
        ]
          .filter(Boolean)
          .join('<br/>');
      },
    },
    legend: {
      data: [
        t('qms.dashboard.currentYearData'),
        t('qms.dashboard.lastYearData'),
      ],
      bottom: 0,
    },
    grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
    xAxis: {
      type: 'category' as const,
      data: trendData.value.map((i) => i.period),
    },
    yAxis: {
      type: 'value' as const,
      name: t('qms.dashboard.failedVehicles'),
      minInterval: 1,
    },
    series: [
      {
        name: t('qms.dashboard.currentYearData'),
        type: 'line' as const,
        data: trendData.value.map((i) => i.currentYear),
        itemStyle: { color: '#1677ff' },
        lineStyle: { color: '#1677ff', width: 2 },
        smooth: true,
      },
      {
        name: t('qms.dashboard.lastYearData'),
        type: 'line' as const,
        data: trendData.value.map((i) => getEffectiveLastYear(i)),
        itemStyle: { color: '#8c8c8c' },
        lineStyle: { color: '#8c8c8c', type: 'dashed' as const, width: 2 },
        smooth: true,
      },
    ],
  };
  renderTrend(trendOption);
}

function openManualModal() {
  manualRows.value = trendData.value
    .map((item) => ({
      count: getEffectiveLastYear(item),
      month: getLastYearMonth(item.period),
    }))
    .filter((item) => item.month);
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
  <div class="relative flex h-[360px] w-full flex-col gap-4 md:flex-row">
    <div
      v-if="loading"
      class="absolute inset-0 z-10 flex items-center justify-center bg-white/50"
    >
      <Spin />
    </div>

    <!-- Ranking List (Left) -->
    <div class="relative h-full w-full border-r border-gray-100 pr-2 md:w-1/3">
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
    <div class="h-full w-full pl-2 md:w-2/3">
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
          <InputNumber
            v-model:value="row.count"
            :min="0"
            :precision="0"
            class="w-40"
          />
        </div>
      </div>
    </Modal>
  </div>
</template>
