<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import { ref, watch } from 'vue';

import { useI18n } from '@vben/locales';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { Card, Col, Row } from 'ant-design-vue';

const props = defineProps<{
  pieData: { name: string; value: number }[];
  trendData: [string, number][];
}>();

const { t } = useI18n();

// 1. 饼图配置
const pieChartRef = ref<EchartsUIType>();
const { renderEcharts: renderPie } = useEcharts(pieChartRef);

// 2. 趋势图配置
const trendChartRef = ref<EchartsUIType>();
const { renderEcharts: renderTrend } = useEcharts(trendChartRef);

// 监听数据变化并渲染
watch(
  () => [props.pieData, props.trendData],
  () => {
    if (props.pieData.length > 0) {
      renderPie({
        tooltip: { trigger: 'item' },
        legend: { bottom: 0 },
        series: [
          {
            type: 'pie',
            radius: ['50%', '75%'],
            center: ['50%', '45%'],
            data: props.pieData,
            itemStyle: {
              borderRadius: 8,
              borderColor: '#fff',
              borderWidth: 2,
            },
            label: { show: false, position: 'center' },
            emphasis: {
              label: {
                show: true,
                fontSize: 16,
                fontWeight: 'bold',
                formatter: '{b}\n{d}%',
              },
            },
          },
        ],
      });
    }
    if (props.trendData.length > 0) {
      renderTrend({
        tooltip: { trigger: 'axis' },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '10%',
          containLabel: true,
        },
        xAxis: {
          type: 'category',
          data: props.trendData.map((d) => `${d[0].split('-')[1]}月`),
        },
        yAxis: { type: 'value', name: '损失金额' },
        series: [
          {
            type: 'line',
            smooth: true,
            data: props.trendData.map((d) => d[1]),
            areaStyle: { opacity: 0.1 },
            itemStyle: { color: '#f5222d' },
          },
        ],
      });
    }
  },
  { deep: true, immediate: true },
);
</script>

<template>
  <Row :gutter="16" class="mb-4">
    <Col :span="8">
      <Card :title="t('qms.inspection.issues.defectType')">
        <EchartsUI ref="pieChartRef" height="300px" />
      </Card>
    </Col>
    <Col :span="16">
      <Card :title="t('qms.inspection.issues.trendAnalysis')">
        <EchartsUI ref="trendChartRef" height="300px" />
      </Card>
    </Col>
  </Row>
</template>
