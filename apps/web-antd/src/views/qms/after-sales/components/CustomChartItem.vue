<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { ChartConfig } from '../composables/useChartAggregation';

import type { DeptTreeNode } from '#/types';

import { onMounted, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { tryOnUnmounted } from '@vueuse/core';

import { renderCustomChart } from '../composables/useChartAggregation';

const props = defineProps<{
  config: ChartConfig;
  dateMode?: 'month' | 'week' | 'year';
  dateValue?: string;
  deptData?: DeptTreeNode[];
  loading?: boolean;
  year?: number;
}>();

const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);
const { t } = useI18n();

// 渲染图表
async function render() {
  await renderCustomChart(
    renderEcharts,
    props.config,
    t,
    {
      dateMode: props.dateMode,
      dateValue: props.dateValue,
      year: props.year,
    },
    props.deptData,
  );
}

// 监听数据或配置变化
watch(
  [
    () => props.config,
    () => props.loading,
    () => props.deptData,
    () => props.dateMode,
    () => props.dateValue,
    () => props.year,
  ],
  ([_, loading]) => {
    if (!loading) {
      // 稍微延迟以确保容器已渲染
      setTimeout(() => {
        void render();
      }, 50);
    }
  },
  { deep: true, immediate: true },
);

onMounted(() => {
  render();
});

tryOnUnmounted(() => {
  if (!chartRef.value) return;
  const instance = useEcharts(chartRef).getChartInstance();
  instance?.dispose();
});
</script>

<template>
  <div class="relative h-full w-full">
    <!-- 将加载状态放在组件内部处理或由父组件控制，这里仅展示图表 -->
    <EchartsUI ref="chartRef" height="100%" width="100%" />
  </div>
</template>
