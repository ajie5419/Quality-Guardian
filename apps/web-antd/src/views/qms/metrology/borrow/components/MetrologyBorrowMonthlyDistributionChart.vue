<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { QmsMetrologyApi } from '#/api/qms/metrology';

import { nextTick, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { tryOnUnmounted } from '@vueuse/core';

const props = defineProps<{
  data: QmsMetrologyApi.MetrologyBorrowOverview['monthlyDistribution'];
}>();

const { t } = useI18n();
const chartRef = ref<EchartsUIType>();
const { renderEcharts, getChartInstance } = useEcharts(chartRef);

function updateChart() {
  if (!chartRef.value || props.data.length === 0) {
    return;
  }

  renderEcharts({
    tooltip: { trigger: 'axis' as const },
    legend: {
      bottom: 0,
      data: [
        t('qms.metrology.borrow.overview.monthlyBorrowed'),
        t('qms.metrology.borrow.overview.monthlyReturned'),
      ],
    },
    grid: {
      bottom: '16%',
      containLabel: true,
      left: '3%',
      right: '4%',
    },
    xAxis: {
      type: 'category' as const,
      data: props.data.map((item) => `${item.month}`),
    },
    yAxis: {
      type: 'value' as const,
    },
    series: [
      {
        name: t('qms.metrology.borrow.overview.monthlyBorrowed'),
        type: 'bar' as const,
        data: props.data.map((item) => item.borrowedCount),
        itemStyle: { color: '#60a5fa' },
      },
      {
        name: t('qms.metrology.borrow.overview.monthlyReturned'),
        type: 'bar' as const,
        data: props.data.map((item) => item.returnedCount),
        itemStyle: { color: '#34d399' },
      },
    ],
  });
}

watch(
  () => props.data,
  () => {
    nextTick(() => updateChart());
  },
  { deep: true, immediate: true },
);

tryOnUnmounted(() => {
  getChartInstance()?.dispose();
});
</script>

<template>
  <div class="h-full rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
    <div class="mb-3 text-sm font-medium text-gray-700">
      {{ t('qms.metrology.borrow.overview.monthlyDistribution') }}
    </div>
    <EchartsUI ref="chartRef" height="320px" width="100%" />
  </div>
</template>
