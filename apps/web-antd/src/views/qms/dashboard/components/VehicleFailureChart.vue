<script lang="ts" setup>
import type { Dayjs } from 'dayjs';

import type { EchartsUIType } from '@vben/plugins/echarts';

import type { EChartsClickParams, EChartsColorParams } from '#/types/common';

import { nextTick, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { tryOnUnmounted } from '@vueuse/core';
import { DatePicker, Spin } from 'ant-design-vue';
import dayjs from 'dayjs';

import { getVehicleFailureRate } from '#/api/qms/dashboard';
import { useErrorHandler } from '#/hooks/useErrorHandler';

/**
 * 车型排行数据项
 */
interface RankingItem {
  failedVehicles: number;
  model: string;
  rate: number;
  totalVehicles: number;
}

/**
 * 趋势数据项
 */
interface TrendItem {
  failedVehicles: number;
  period: string;
  rate: number;
  totalVehicles: number;
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
const rankingData = ref<RankingItem[]>([]);
const trendData = ref<TrendItem[]>([]);
const selectedModel = ref<null | string>(null);
const selectedMonth = ref<Dayjs>(dayjs());

function normalizeRankingItem(item: unknown): RankingItem {
  const normalized = item as Record<string, number | string>;
  return {
    failedVehicles: Number(
      normalized.failedVehicles || normalized.faultWorkOrders || 0,
    ),
    model: String(normalized.model || ''),
    rate: Number(normalized.rate || 0),
    totalVehicles: Number(
      normalized.totalVehicles || normalized.shippedWorkOrders || 0,
    ),
  };
}

function normalizeTrendItem(item: unknown): TrendItem {
  const normalized = item as Record<string, number | string>;
  return {
    failedVehicles: Number(
      normalized.failedVehicles || normalized.faultWorkOrders || 0,
    ),
    period: String(normalized.period || ''),
    rate: Number(normalized.rate || 0),
    totalVehicles: Number(
      normalized.totalVehicles || normalized.shippedWorkOrders || 0,
    ),
  };
}

async function fetchData(model?: string) {
  loading.value = true;
  try {
    const res = await getVehicleFailureRate({
      month: selectedMonth.value.format('YYYY-MM'),
      model: model || undefined,
    });
    // Ensure we handle empty response gracefully
    if (res) {
      if (!model) {
        rankingData.value = (res.ranking || []).map((item) =>
          normalizeRankingItem(item as unknown),
        );
      }
      trendData.value = (res.trend || []).map((item) =>
        normalizeTrendItem(item as unknown),
      );
    } else {
      if (!model) rankingData.value = [];
      trendData.value = [];
    }
    // Update charts even if data is empty (to hide old data or show empty axes)
    updateCharts();
  } catch (error) {
    handleApiError(error, 'Load Vehicle Failure Data');
  } finally {
    loading.value = false;
  }
}

function updateCharts() {
  // Skip if not active to avoid rendering on hidden container
  if (!props.active) return;

  // 1. Ranking Chart (Left)
  if (!selectedModel.value && rankingData.value) {
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
            (entry) => entry.model === first?.name,
          );
          if (!item) {
            return '';
          }
          return [
            `${item.model}`,
            `${t('qms.dashboard.vehicleFailureRate')}: ${item.rate}%`,
            `${t('qms.dashboard.failedVehicles')}: ${item.failedVehicles}`,
            `${t('qms.dashboard.totalVehicles')}: ${item.totalVehicles}`,
          ].join('<br/>');
        },
      },
      grid: { left: '3%', right: '10%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'value' as const,
        name: `${t('qms.dashboard.vehicleFailureRate')}%`,
        axisLabel: { formatter: '{value}%' },
      },
      yAxis: {
        type: 'category' as const,
        data: rankingData.value.map((i) => i.model).reverse(),
      },
      series: [
        {
          name: t('qms.dashboard.vehicleFailureRate'),
          type: 'bar' as const,
          data: rankingData.value.map((i) => i.rate).reverse(),
          itemStyle: {
            color: (params: EChartsColorParams) => {
              return (params.value as number) > 2 ? '#ff4d4f' : '#5ab1ef';
            },
          },
          label: { show: true, position: 'right' as const, formatter: '{c}%' },
        },
      ],
    };
    renderRanking(rankingOption).then(() => {
      const instance = getRankingInstance();
      if (instance) {
        instance.off('click');
        instance.on('click', (params: unknown) => {
          const typedParams = params as EChartsClickParams;
          const model = typedParams.name;
          handleModelSelect(model);
        });
        instance.getZr().setCursorStyle('pointer');
      }
    });
  }

  // 2. Trend Chart (Right) - render empty if no data
  const trendOption = {
    title: {
      text: selectedModel.value
        ? `${selectedModel.value} ${t('qms.dashboard.vehicleFailureRateTrend')}`
        : t('qms.dashboard.overallVehicleFailureRateTrend'),
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
          `${t('qms.dashboard.vehicleFailureRate')}: ${item.rate}%`,
          `${t('qms.dashboard.failedVehicles')}: ${item.failedVehicles}`,
          `${t('qms.dashboard.totalVehicles')}: ${item.totalVehicles}`,
        ].join('<br/>');
      },
    },
    legend: {
      data: [
        t('qms.dashboard.totalVehicles'),
        t('qms.dashboard.vehicleFailureRate'),
      ],
      bottom: 0,
    },
    grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
    xAxis: {
      type: 'category' as const,
      data: trendData.value.map((i) => i.period),
    },
    yAxis: [
      {
        type: 'value' as const,
        name: t('qms.dashboard.totalVehicles'),
        position: 'left' as const,
      },
      {
        type: 'value' as const,
        name: t('qms.dashboard.vehicleFailureRate'),
        position: 'right' as const,
        axisLabel: { formatter: '{value}%' },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: t('qms.dashboard.totalVehicles'),
        type: 'bar' as const,
        data: trendData.value.map((i) => i.totalVehicles),
        itemStyle: { color: '#d9d9d9', borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 30,
      },
      {
        name: t('qms.dashboard.vehicleFailureRate'),
        type: 'line' as const,
        yAxisIndex: 1,
        data: trendData.value.map((i) => i.rate),
        itemStyle: { color: '#ff4d4f' },
        smooth: true,
        markLine: {
          data: [
            {
              yAxis: 2,
              name: t('qms.dashboard.warningLine'),
              lineStyle: { color: 'red', type: 'dashed' as const },
            },
          ],
        },
      },
    ],
  };
  renderTrend(trendOption);
}

function handleModelSelect(model: string) {
  if (selectedModel.value === model) {
    selectedModel.value = null;
    fetchData();
  } else {
    selectedModel.value = model;
    fetchData(model);
  }
}

// Initial load if active immediately
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
  selectedModel.value = null;
  fetchData();
});

tryOnUnmounted(() => {
  if (getRankingInstance()) {
    getRankingInstance()?.dispose();
  }
  // Trend chart handles its own lifecycle usually but explicit disposal is safer
  // useEcharts composable from vben should handle it, but double safety as requested
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

      <div
        v-if="selectedModel"
        class="absolute right-0 top-0 z-10 cursor-pointer rounded bg-blue-50 px-2 py-1 text-xs text-blue-500 hover:bg-blue-100"
        @click="handleModelSelect(selectedModel)"
      >
        取消筛选
      </div>
    </div>

    <!-- Trend Chart (Right) -->
    <div class="h-full w-full pl-2 md:w-2/3">
      <EchartsUI ref="trendChartRef" width="100%" height="100%" />
    </div>
  </div>
</template>
