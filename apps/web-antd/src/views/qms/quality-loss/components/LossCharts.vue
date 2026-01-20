<script lang="ts" setup>
import { ref, watch, toRef } from 'vue';
import { Card, Col, Row } from 'ant-design-vue';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import type { EchartsUIType } from '@vben/plugins/echarts';
import type { QmsQualityLossApi } from '#/api/qms/quality-loss';
import type { DeptNode } from '../types';
import { useLossCharts } from '../composables/useLossCharts';

const props = defineProps<{
  data: QmsQualityLossApi.QualityLossItem[];
  departments: DeptNode[];
}>();

const typeChartRef = ref<EchartsUIType>();
const trendChartRef = ref<EchartsUIType>();
const { renderEcharts: renderTypeChart } = useEcharts(typeChartRef);
const { renderEcharts: renderTrendChart } = useEcharts(trendChartRef);

const { getDeptDistributionOption, getTrendOption } = useLossCharts(
  toRef(props, 'data'),
  toRef(props, 'departments'),
);

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
watch(() => props.data, () => {
  setTimeout(refreshCharts, 300);
}, { deep: true, immediate: true });

watch(() => props.departments, () => {
  refreshCharts();
}, { deep: true });
</script>

<template>
  <Row :gutter="16">
    <!-- 责任部门损失构成 -->
    <Col :span="8">
      <Card title="责任部门损失构成" :bordered="false" class="h-[380px] shadow-sm">
        <EchartsUI ref="typeChartRef" height="300px" />
      </Card>
    </Col>
    
    <!-- 月度损失与索赔趋势 -->
    <Col :span="16">
      <Card title="月度损失与索赔趋势" :bordered="false" class="h-[380px] shadow-sm">
        <EchartsUI ref="trendChartRef" height="300px" />
      </Card>
    </Col>
  </Row>
</template>
