<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { EChartsClickParams, EChartsColorParams } from '#/types/common';

import { nextTick, ref, watch } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { Spin } from 'ant-design-vue';

import { getVehicleFailureRate } from '#/api/qms/dashboard';

/**
 * 车型排行数据项
 */
interface RankingItem {
  model: string;
  rate: number;
}

/**
 * 趋势数据项
 */
interface TrendItem {
  period: string;
  shipped: number;
  rate: number;
}

interface Props {
  active?: boolean;
}

const props = defineProps<Props>();

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

async function fetchData(model?: string) {
  loading.value = true;
  try {
    const res = await getVehicleFailureRate({
      range: '12m',
      model: model || undefined,
    });
    // Ensure we handle empty response gracefully
    if (res) {
      if (!model) {
        rankingData.value = res.ranking || [];
      }
      trendData.value = res.trend || [];
    } else {
      if (!model) rankingData.value = [];
      trendData.value = [];
    }
    // Update charts even if data is empty (to hide old data or show empty axes)
    updateCharts();
  } catch (error) {
    console.error('Failed to vehicle failure data:', error);
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
        text: '车型故障率排行 (Top 10)',
        left: 'center',
        textStyle: { fontSize: 14 },
      },
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
      },
      grid: { left: '3%', right: '10%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'value' as const,
        name: '故障率%',
        axisLabel: { formatter: '{value}%' },
      },
      yAxis: {
        type: 'category' as const,
        data: rankingData.value.map((i) => i.model).reverse(),
      },
      series: [
        {
          name: '故障率',
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
        ? `${selectedModel.value} 故障率趋势`
        : '总体故障率趋势',
      left: 'center',
      subtext: '近12个月',
      textStyle: { fontSize: 14 },
    },
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'cross' as const },
    },
    legend: { data: ['出货量', '故障率'], bottom: 0 },
    grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
    xAxis: {
      type: 'category' as const,
      data: trendData.value.map((i) => i.period),
    },
    yAxis: [
      { type: 'value' as const, name: '出货量', position: 'left' as const },
      {
        type: 'value' as const,
        name: '故障率',
        position: 'right' as const,
        axisLabel: { formatter: '{value}%' },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '出货量',
        type: 'bar' as const,
        data: trendData.value.map((i) => i.shipped),
        itemStyle: { color: '#d9d9d9', borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 30,
      },
      {
        name: '故障率',
        type: 'line' as const,
        yAxisIndex: 1,
        data: trendData.value.map((i) => i.rate),
        itemStyle: { color: '#ff4d4f' },
        smooth: true,
        markLine: {
          data: [
            {
              yAxis: 2,
              name: '预警线',
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
