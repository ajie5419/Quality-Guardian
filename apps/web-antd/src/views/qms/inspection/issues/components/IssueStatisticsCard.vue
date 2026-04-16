<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { StatisticsData } from '../types';

import { computed, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { tryOnUnmounted } from '@vueuse/core';
import { Button, Card, Col, Row, Statistic } from 'ant-design-vue';

const props = defineProps<{
  loading?: boolean;
  statistics: StatisticsData;
}>();

const emit = defineEmits<{
  generateInsight: [];
}>();

const { t } = useI18n();
const chartRef = ref<EchartsUIType>();
const { getChartInstance, renderEcharts } = useEcharts(chartRef);

const pieData = computed(() =>
  (props.statistics.pieData || []).filter((item) => item.value > 0),
);

function renderPieChart() {
  if (!chartRef.value || pieData.value.length === 0) return;
  renderEcharts({
    color: ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
    legend: { show: false },
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
    },
    series: [
      {
        type: 'pie',
        radius: ['45%', '72%'],
        center: ['50%', '50%'],
        data: pieData.value,
        label: { show: false },
        labelLine: { show: false },
      },
    ],
  });
}

watch(pieData, renderPieChart, { deep: true, immediate: true });
watch(chartRef, renderPieChart);

tryOnUnmounted(() => {
  getChartInstance()?.dispose();
});
</script>

<template>
  <Card size="small" class="mb-4 border-none bg-gray-50 shadow-sm">
    <Row :gutter="16" class="items-center text-center">
      <Col :span="4">
        <Statistic
          :title="t('qms.inspection.issues.totalCount')"
          :value="statistics.totalCount"
        />
      </Col>
      <Col :span="4">
        <Statistic
          :title="t('qms.inspection.issues.status.open')"
          :value="statistics.openCount"
          :value-style="{ color: '#cf1322' }"
        />
      </Col>
      <Col :span="4">
        <Statistic
          :title="t('qms.inspection.issues.status.closed')"
          :value="statistics.closedCount"
          :value-style="{ color: '#3f8600' }"
        />
      </Col>
      <Col :span="4">
        <Statistic
          :title="`${t('qms.inspection.issues.lossAmount')} (RMB)`"
          :value="statistics.totalLoss"
          prefix="¥"
          :precision="2"
        />
      </Col>
      <Col :span="4">
        <div v-if="pieData.length > 0" class="h-[76px] w-full">
          <EchartsUI ref="chartRef" height="100%" width="100%" />
        </div>
        <div v-else class="text-xs text-gray-400">
          {{ t('common.noData') }}
        </div>
      </Col>
      <Col :span="4">
        <Button
          type="primary"
          shape="round"
          block
          :loading="loading"
          @click="emit('generateInsight')"
        >
          <span class="i-lucide-scroll-text mr-1"></span>
          {{ t('qms.inspection.issues.aiInsightReport') }}
        </Button>
      </Col>
    </Row>
  </Card>
</template>
