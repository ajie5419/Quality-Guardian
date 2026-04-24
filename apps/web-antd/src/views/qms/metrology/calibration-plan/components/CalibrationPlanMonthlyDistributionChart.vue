<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { QmsMetrologyApi } from '#/api/qms/metrology';

import { nextTick, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { tryOnUnmounted } from '@vueuse/core';

const props = defineProps<{
  data: QmsMetrologyApi.MetrologyCalibrationPlanOverview['monthlyDistribution'];
}>();

const emit = defineEmits<{
  (e: 'monthClick', month: number): void;
}>();

type MonthlyDistributionItem =
  QmsMetrologyApi.MetrologyCalibrationPlanOverview['monthlyDistribution'][number];

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
        t('qms.metrology.calibrationPlan.status.planned'),
        t('qms.metrology.calibrationPlan.status.completed'),
        t('qms.metrology.calibrationPlan.status.overdue'),
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
      data: props.data.map((item: MonthlyDistributionItem) => `${item.month}`),
    },
    yAxis: {
      type: 'value' as const,
    },
    series: [
      {
        name: t('qms.metrology.calibrationPlan.status.planned'),
        type: 'bar' as const,
        stack: 'total',
        data: props.data.map((item: MonthlyDistributionItem) => item.planned),
        itemStyle: { color: '#60a5fa' },
      },
      {
        name: t('qms.metrology.calibrationPlan.status.completed'),
        type: 'bar' as const,
        stack: 'total',
        data: props.data.map((item: MonthlyDistributionItem) => item.completed),
        itemStyle: { color: '#34d399' },
      },
      {
        name: t('qms.metrology.calibrationPlan.status.overdue'),
        type: 'bar' as const,
        stack: 'total',
        data: props.data.map((item: MonthlyDistributionItem) => item.overdue),
        itemStyle: { color: '#f87171' },
      },
    ],
  }).then(() => {
    const instance = getChartInstance();
    if (!instance) {
      return;
    }
    instance.off('click');
    instance.on('click', (params: { dataIndex?: number }) => {
      if (typeof params.dataIndex !== 'number') {
        return;
      }
      const month = props.data[params.dataIndex]?.month;
      if (month) {
        emit('monthClick', month);
      }
    });
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
      {{ t('qms.metrology.calibrationPlan.overview.monthlyDistribution') }}
    </div>
    <EchartsUI ref="chartRef" height="360px" width="100%" />
  </div>
</template>
