<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { ChartConfig } from '#/components/Qms/ChartBuilder/types';

import { ref, watch } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { tryOnUnmounted } from '@vueuse/core';

import { renderCustomChart } from '../composables/useIssueChartAggregation';

const props = defineProps<{
  config: ChartConfig;
  dateMode?: 'month' | 'week' | 'year';
  dateValue?: string;
  year?: number;
}>();

const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);

async function render() {
  await renderCustomChart(renderEcharts, props.config, {
    dateMode: props.dateMode,
    dateValue: props.dateValue,
    year: props.year,
  });
}

watch(
  [
    () => props.config,
    () => props.dateMode,
    () => props.dateValue,
    () => props.year,
  ],
  () => {
    setTimeout(() => {
      void render();
    }, 50);
  },
  { deep: true, immediate: true },
);

tryOnUnmounted(() => {
  if (!chartRef.value) return;
  const instance = useEcharts(chartRef).getChartInstance();
  instance?.dispose();
});
</script>

<template>
  <div class="relative h-full w-full">
    <EchartsUI ref="chartRef" height="100%" width="100%" />
  </div>
</template>
