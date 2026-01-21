<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { ChartConfig } from './types';

import { onMounted, ref, watch } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

const props = defineProps<{
  config: ChartConfig;
  data: any[];
  // Function to generate option from data and config
  getOption: (data: any[], config: ChartConfig) => any;
  loading?: boolean;
}>();

const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);

// 渲染图表
function render() {
  if (!props.data || props.data.length === 0) return;

  try {
    const option = props.getOption(props.data, props.config);
    if (option) {
      renderEcharts(option as any);
    } else {
      console.warn('[CustomChartItem] Generated option is null');
    }
  } catch (error) {
    console.error('[CustomChartItem] Render error:', error);
  }
}

// 监听数据或配置变化
watch(
  [() => props.data, () => props.config, () => props.loading],
  ([data, _, loading]) => {
    if (!loading && data && data.length > 0) {
      setTimeout(() => {
        render();
      }, 50);
    }
  },
  { deep: true, immediate: true },
);

onMounted(() => {
  render();
});
</script>

<template>
  <div class="relative h-full w-full">
    <EchartsUI ref="chartRef" height="100%" width="100%" />
  </div>
</template>
