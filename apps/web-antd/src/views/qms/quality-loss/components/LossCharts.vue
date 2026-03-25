<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { QualityLossCharts } from '#/api/qms/quality-loss';

import { computed, onUnmounted, ref, watch } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { Card, Col, Empty, Row, Select } from 'ant-design-vue';

const props = defineProps<{
  chartData: null | QualityLossCharts;
  selectedGranularity: 'month' | 'week' | 'year';
  selectedYear: number;
  yearOptions: number[];
}>();
const emit = defineEmits<{
  'update:selectedGranularity': [value: 'month' | 'week' | 'year'];
  'update:selectedYear': [value: number];
}>();

const typeChartRef = ref<EchartsUIType>();
const trendChartRef = ref<EchartsUIType>();
const { renderEcharts: renderTypeChart } = useEcharts(typeChartRef);
const { renderEcharts: renderTrendChart } = useEcharts(trendChartRef);

const selectedYearModel = computed({
  get: () => props.selectedYear,
  set: (value: number) => emit('update:selectedYear', value),
});
const selectedGranularityModel = computed({
  get: () => props.selectedGranularity,
  set: (value: 'month' | 'week' | 'year') =>
    emit('update:selectedGranularity', value),
});

const trendTitle = computed(() => {
  if (props.selectedGranularity === 'year') {
    return '年度损益趋势';
  }
  if (props.selectedGranularity === 'week') {
    return `${props.selectedYear}年 周度损益趋势`;
  }
  return `${props.selectedYear}年 月度损益趋势`;
});
const hasDeptData = computed(() => {
  const data = props.chartData?.deptDistribution || [];
  return data.some((item) => Number(item.value) > 0);
});
const hasTrendData = computed(() => {
  const data = props.chartData?.trend || [];
  return data.some(
    (item) => Number(item.totalAmount) > 0 || Number(item.claimAmount) > 0,
  );
});

/**
 * 刷新图表
 */
function refreshCharts() {
  if (!props.chartData || !hasDeptData.value || !hasTrendData.value) return;

  renderTypeChart({
    tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
    legend: { bottom: '0', icon: 'circle', type: 'scroll' },
    series: [
      {
        name: '损失金额',
        type: 'pie',
        radius: ['45%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
        label: { show: false, position: 'center' },
        emphasis: {
          label: { show: true, fontSize: '16', fontWeight: 'bold' },
        },
        data: props.chartData.deptDistribution,
      },
    ],
  });

  renderTrendChart({
    title: {
      text: trendTitle.value,
      left: 'center',
      top: 0,
      textStyle: { fontSize: 13, color: '#666', fontWeight: 'normal' },
    },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['预计损失', '实际索赔'], bottom: 0 },
    grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
    xAxis: {
      type: 'category',
      data: props.chartData.trend.map((item) => item.periodLabel),
      axisLine: { lineStyle: { color: '#eee' } },
      axisLabel: { color: '#999' },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { type: 'dashed' as const, color: '#f5f5f5' } },
    },
    series: [
      {
        name: '预计损失',
        type: 'line',
        smooth: true,
        areaStyle: { color: 'rgba(24,144,255,0.1)' },
        data: props.chartData.trend.map((item) => item.totalAmount),
        color: '#1890ff',
      },
      {
        name: '实际索赔',
        type: 'line',
        smooth: true,
        data: props.chartData.trend.map((item) => item.claimAmount),
        color: '#52c41a',
      },
    ],
  });
}

// 监听数据变化刷新
watch(
  () => [props.chartData, props.selectedGranularity, props.selectedYear],
  () => {
    setTimeout(refreshCharts, 150);
  },
  { deep: true, immediate: true },
);

// 🌟 销毁图表实例防止内存泄漏
onUnmounted(() => {
  typeChartRef.value?.getInstance()?.dispose();
  trendChartRef.value?.getInstance()?.dispose();
});
</script>

<template>
  <Row :gutter="16">
    <!-- 责任部门损失构成 -->
    <Col :span="8">
      <Card
        title="责任部门损失构成"
        :bordered="false"
        class="h-[380px] shadow-sm"
      >
        <EchartsUI v-if="hasDeptData" ref="typeChartRef" height="300px" />
        <div v-else class="flex h-[300px] items-center justify-center">
          <Empty description="当前筛选条件下暂无部门损失数据" />
        </div>
      </Card>
    </Col>

    <!-- 月度损失与索赔趋势 -->
    <Col :span="16">
      <Card :bordered="false" class="h-[380px] shadow-sm">
        <template #title>
          <div class="flex items-center justify-between">
            <span>损失与索赔趋势</span>
            <div class="flex items-center gap-2">
              <Select
                v-model:value="selectedGranularityModel"
                style="width: 90px"
                size="small"
              >
                <Select.Option value="year">年</Select.Option>
                <Select.Option value="month">月</Select.Option>
                <Select.Option value="week">周</Select.Option>
              </Select>
              <Select
                v-if="selectedGranularityModel !== 'year'"
                v-model:value="selectedYearModel"
                style="width: 100px"
                size="small"
                placeholder="请选择年份"
              >
                <Select.Option
                  v-for="year in yearOptions"
                  :key="year"
                  :value="year"
                >
                  {{ year }}年
                </Select.Option>
              </Select>
            </div>
          </div>
        </template>
        <EchartsUI v-if="hasTrendData" ref="trendChartRef" height="280px" />
        <div v-else class="flex h-[280px] items-center justify-center">
          <Empty description="当前筛选条件下暂无趋势数据" />
        </div>
      </Card>
    </Col>
  </Row>
</template>
