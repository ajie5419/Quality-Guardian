<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { EChartsClickParams } from '#/types/common';

import { computed, nextTick, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { tryOnUnmounted } from '@vueuse/core';

/**
 * 质量损失趋势数据项
 */
interface QualityLossDataItem {
  externalAmount?: number;
  internalAmount?: number;
  manualAmount?: number;
  period: string;
}

interface Props {
  data: QualityLossDataItem[];
  granularity: 'month' | 'week';
  active?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits(['chartClick']);
const { t } = useI18n();
const chartRef = ref<EchartsUIType>();
const { renderEcharts, resize, getChartInstance } = useEcharts(chartRef);

// Computed property to control rendering
const shouldRender = computed(() => props.active);

function updateChart() {
  if (!props.data || props.data.length === 0 || !chartRef.value) return;

  const chartOption = {
    title: {
      text:
        props.granularity === 'week'
          ? t('qms.dashboard.weeklyQualityLossTrend')
          : t('qms.dashboard.monthlyQualityLossTrend'),
      left: 'center',
    },
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
    },
    legend: {
      data: [
        t('qms.qualityLoss.source.internal'),
        t('qms.qualityLoss.source.external'),
        t('qms.qualityLoss.source.manual'),
      ],
      bottom: 0,
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '10%',
      containLabel: true,
    },
    xAxis: {
      type: 'category' as const,
      data: props.data.map((i) => i.period),
    },
    yAxis: {
      type: 'value' as const,
      name: t('qms.qualityLoss.amountLabel'),
    },
    series: [
      {
        name: t('qms.qualityLoss.source.internal'),
        type: 'bar' as const,
        stack: 'total',
        data: props.data.map((i) => i.internalAmount),
        itemStyle: { color: '#FAC858' },
      },
      {
        name: t('qms.qualityLoss.source.external'),
        type: 'bar' as const,
        stack: 'total',
        data: props.data.map((i) => i.externalAmount),
        itemStyle: { color: '#EE6666' },
      },
      {
        name: t('qms.qualityLoss.source.manual'),
        type: 'bar' as const,
        stack: 'total',
        data: props.data.map((i) => i.manualAmount),
        itemStyle: { color: '#91CC75' },
      },
    ],
  };

  renderEcharts(chartOption).then(() => {
    const instance = getChartInstance();
    if (instance) {
      instance.off('click');
      instance.on('click', (params: unknown) => {
        emit('chartClick', params as EChartsClickParams);
      });
    }
  });
}

// Watchers similar to PassRateTrendChart for robust lifecycle
watch(
  () => props.data,
  () => {
    if (shouldRender.value) updateChart();
  },
  { deep: true },
);

watch(shouldRender, (val) => {
  if (val) {
    nextTick(() => {
      setTimeout(() => {
        updateChart();
        resize();
      }, 50);
    });
  }
});

watch(
  () => chartRef.value,
  (val) => {
    if (val && shouldRender.value) {
      nextTick(() => {
        setTimeout(() => {
          updateChart();
          resize();
        }, 50);
      });
    }
  },
);

tryOnUnmounted(() => {
  if (!getChartInstance) return;
  getChartInstance()?.dispose();
});
</script>

<template>
  <div class="w-full">
    <div style="height: 320px" class="w-full">
      <EchartsUI
        v-if="shouldRender"
        ref="chartRef"
        width="100%"
        height="100%"
      />
      <div v-else class="flex h-full w-full items-center justify-center">
        <span class="text-gray-300">{{ t('common.loadingText') }}</span>
      </div>
    </div>
  </div>
</template>
