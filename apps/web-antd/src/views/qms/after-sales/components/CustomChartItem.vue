<script lang="ts" setup>
import type { QmsAfterSalesApi } from '#/api/qms/after-sales';
import type { ChartConfig } from '../composables/useChartAggregation';

import { ref, watch, onMounted } from 'vue';
import { EchartsUI, useEcharts, type EchartsUIType } from '@vben/plugins/echarts';
import { renderCustomChart } from '../composables/useChartAggregation';

const props = defineProps<{
  config: ChartConfig;
  data: QmsAfterSalesApi.AfterSalesItem[];
  loading?: boolean;
  deptData?: any[];
}>();

const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);

// 渲染图表
function render() {
  if (!props.data || props.data.length === 0) return;
  
  // 使用标准的 renderEcharts 函数，它会自动处理 setOption 和 resize
  renderCustomChart(renderEcharts, props.data, props.config, props.deptData);
}

// 监听数据或配置变化
watch(
  [() => props.data, () => props.config, () => props.loading, () => props.deptData],
  ([data, _, loading]) => {
    if (!loading && data && data.length > 0) {
      // 稍微延迟以确保容器已渲染
      setTimeout(() => {
        render();
      }, 50);
    }
  },
  { deep: true, immediate: true }
);

onMounted(() => {
  render();
});
</script>

<template>
  <div class="h-full w-full relative">
    <!-- 将加载状态放在组件内部处理或由父组件控制，这里仅展示图表 -->
    <EchartsUI ref="chartRef" height="100%" width="100%" />
  </div>
</template>
