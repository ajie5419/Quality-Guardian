<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { EChartsClickParams } from '#/types/common';

import { computed, nextTick, ref, watch } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

/**
 * 合格率趋势数据项
 */
interface PassRateTrendItem {
  period: string;
  passRate: number;
}

interface Props {
  trendData: PassRateTrendItem[];
  granularity: 'month' | 'week';
  active?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits(['chartClick']);

const passRateChartRef = ref<EchartsUIType>();
const { renderEcharts, getChartInstance, resize } =
  useEcharts(passRateChartRef);

// Computed property to control rendering
// We only render the EchartsUI component when the tab is active
const shouldRender = computed(() => props.active);

function updatePassRateChart() {
  if (props.trendData.length === 0) return;
  // Safety check: if ref is missing (e.g. unmounted), stop
  if (!passRateChartRef.value) return;

  const chartOption = {
    title: {
      text: props.granularity === 'week' ? '周度合格率趋势' : '月度合格率趋势',
      left: 'center',
    },
    tooltip: {
      trigger: 'axis' as const,
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category' as const,
      data: props.trendData.map((i) => i.period),
    },
    yAxis: {
      type: 'value' as const,
      min: 0,
      max: 100,
      axisLabel: { formatter: '{value}%' },
    },
    series: [
      {
        data: props.trendData.map((i) => i.passRate),
        type: 'bar' as const,
        itemStyle: {
          color: '#5ab1ef',
          borderRadius: [4, 4, 0, 0],
        },
        label: {
          show: true,
          position: 'top' as const,
          formatter: '{c}%',
          color: '#666',
        },
        barWidth: '50%',
      },
    ],
  };

  const result = renderEcharts(chartOption);
  if (result && typeof (result as any).then === 'function') {
    (result as any).then(() => {
      const instance = getChartInstance();
      if (instance) {
        instance.off('click');
        instance.on('click', (params: unknown) => {
          emit('chartClick', params as EChartsClickParams);
        });
      }
    });
  } else {
    // If not a promise, just set up listener next tick
    nextTick(() => {
      const instance = getChartInstance();
      if (instance) {
        instance.off('click');
        instance.on('click', (params: unknown) => {
          emit('chartClick', params as EChartsClickParams);
        });
      }
    });
  }
}

// When data changes, re-render if visible
watch(
  () => props.trendData,
  () => {
    if (shouldRender.value) {
      updatePassRateChart();
    }
  },
  { deep: true },
);

// When shouldRender becomes true (Tab Active), wait for mount then render
watch(shouldRender, (val) => {
  if (val) {
    nextTick(() => {
      // Small delay to allow DOM to paint
      setTimeout(() => {
        updatePassRateChart();
        resize();
      }, 50);
    });
  }
});

// Also watch the Ref itself for the initial mount case
watch(
  () => passRateChartRef.value,
  (val) => {
    if (val && shouldRender.value) {
      nextTick(() => {
        setTimeout(() => {
          updatePassRateChart();
          resize();
        }, 50);
      });
    }
  },
);
</script>

<template>
  <div class="w-full">
    <!-- Chart container with fixed height -->
    <div style="height: 320px" class="w-full">
      <!-- Only render EchartsUI when active. This forces a fresh mount every time. -->
      <EchartsUI
        v-if="shouldRender"
        ref="passRateChartRef"
        width="100%"
        height="100%"
      />

      <!-- Placeholder when inactive to keep layout stable if needed (optional) -->
      <div v-else class="flex h-full w-full items-center justify-center">
        <span class="text-gray-300">Loading Chart...</span>
      </div>
    </div>

    <div class="mt-2 text-center text-sm text-gray-400">
      点击柱状图查看各工序合格率详情
    </div>
  </div>
</template>
