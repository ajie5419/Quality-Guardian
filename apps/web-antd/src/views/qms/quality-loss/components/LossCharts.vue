<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { DeptNode } from '../types';

import type { QmsQualityLossApi } from '#/api/qms/quality-loss';

import { onUnmounted, ref, toRef, watch } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { Card, Col, Row, Select } from 'ant-design-vue';

import { useLossCharts } from '../composables/useLossCharts';

const props = defineProps<{
  data: QmsQualityLossApi.QualityLossItem[];
  departments: DeptNode[];
}>();

const typeChartRef = ref<EchartsUIType>();
const trendChartRef = ref<EchartsUIType>();
const { renderEcharts: renderTypeChart } = useEcharts(typeChartRef);
const { renderEcharts: renderTrendChart } = useEcharts(trendChartRef);

const {
  getDeptDistributionOption,
  getTrendOption,
  availableYears,
  selectedYear,
} = useLossCharts(toRef(props, 'data'), toRef(props, 'departments'));

/**
 * 刷新图表
 */
function refreshCharts() {
  if (props.data.length === 0) return;

  // 注入最新数据并渲染
  renderTypeChart(getDeptDistributionOption());
  renderTrendChart(getTrendOption());
}

// 监听数据变化刷新
watch(
  () => props.data,
  () => {
    setTimeout(refreshCharts, 300);
  },
  { deep: true, immediate: true },
);

watch(
  () => props.departments,
  () => {
    refreshCharts();
  },
  { deep: true },
);

// 🌟 监听年份变化刷新
watch(selectedYear, () => {
  refreshCharts();
});

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
        <EchartsUI ref="typeChartRef" height="300px" />
      </Card>
    </Col>

    <!-- 月度损失与索赔趋势 -->
    <Col :span="16">
      <Card :bordered="false" class="h-[380px] shadow-sm">
        <template #title>
          <div class="flex items-center justify-between">
            <span>月度损失与索赔趋势</span>
            <!-- 🌟 年份选择器 -->
            <Select
              v-model:value="selectedYear"
              style="width: 100px"
              size="small"
              placeholder="请选择年份"
            >
              <Select.Option
                v-for="year in availableYears"
                :key="year"
                :value="year"
              >
                {{ year }}年
              </Select.Option>
            </Select>
          </div>
        </template>
        <EchartsUI ref="trendChartRef" height="280px" />
      </Card>
    </Col>
  </Row>
</template>
