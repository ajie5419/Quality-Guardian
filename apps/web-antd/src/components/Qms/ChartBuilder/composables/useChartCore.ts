import type { ECOption as EChartsOption } from '@vben/plugins/echarts';

import type { ChartConfig, ChartOptionItem } from '../types';

export function buildChartOptionFromAggregated(
  data: Array<{ name: string; value: number }>,
  config: ChartConfig,
  metricOptions: ChartOptionItem[],
): EChartsOption | null {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }
  const normalized = data
    .map((item) => ({
      name: String(item.name || 'Unknown'),
      value: Number(item.value || 0),
    }))
    .sort((a, b) => b.value - a.value);
  return generateChartOption(normalized, config, metricOptions);
}

// Modern color palette
const COLOR_PALETTE = [
  '#3b82f6',
  '#06b6d4',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#6366f1',
  '#14b8a6',
  '#f43f5e',
  '#f97316',
];

/**
 * Generate ECharts Option
 */
function generateChartOption(
  data: { name: string; value: number }[],
  config: ChartConfig,
  metricOptions: ChartOptionItem[],
): any {
  const metricLabel =
    metricOptions.find((m) => m.value === config.metric)?.label ||
    config.metric;

  const commonGrid = {
    left: 20,
    right: 20,
    bottom: 30, // 增加底部边距，防止旋转的 X 轴标签被截断
    top: 40,
    containLabel: true,
  };

  const commonAxisLabel = {
    interval: 0,
    rotate: data.length > 5 ? 30 : 0,
    color: '#6b7280',
    formatter: (value: string) => {
      // 超过 6 个字符截断，防止 X 轴标签过长导致显示不全
      return value.length > 6 ? `${value.slice(0, 6)}...` : value;
    },
  };

  const commonTooltip = {
    trigger: 'axis',
    axisPointer: { type: 'line' },
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: '#374151' },
    extraCssText:
      'box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border-radius: 8px;',
  };

  const commonAxis = {
    axisLine: { show: false }, // Hide axis line
    axisTick: { show: false }, // Hide ticks
    axisLabel: { color: '#6b7280', fontSize: 12 },
    splitLine: {
      show: true,
      lineStyle: { type: 'dashed', color: '#f3f4f6' },
    },
  };

  // Bar Chart
  if (config.chartType === 'bar') {
    return {
      tooltip: { ...commonTooltip, axisPointer: { type: 'shadow' } },
      grid: commonGrid,
      color: COLOR_PALETTE,
      xAxis: {
        type: 'category',
        data: data.map((d) => d.name),
        axisLabel: commonAxisLabel,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#e5e7eb' } },
      },
      yAxis: {
        type: 'value',
        name: metricLabel,
        nameTextStyle: {
          color: '#9ca3af',
          align: 'right',
          padding: [0, 10, 0, 0],
        },
        ...commonAxis,
      },
      series: [
        {
          name: metricLabel,
          type: 'bar',
          data: data.map((d) => d.value),
          barMaxWidth: 40, // Prevent overly wide bars
          itemStyle: {
            borderRadius: [4, 4, 0, 0], // Top rounded corners
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: '#60a5fa' }, // Light Blue
                { offset: 1, color: '#2563eb' }, // Dark Blue
              ],
            },
          },
          label: {
            show: true,
            position: 'top',
            color: '#6b7280',
            fontWeight: 500,
          },
        },
      ],
    };
  }

  // Line Chart
  if (config.chartType === 'line') {
    return {
      tooltip: commonTooltip,
      grid: commonGrid,
      color: COLOR_PALETTE,
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: data.map((d) => d.name),
        axisLabel: commonAxisLabel,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#e5e7eb' } },
      },
      yAxis: {
        type: 'value',
        name: metricLabel,
        nameTextStyle: {
          color: '#9ca3af',
          align: 'right',
          padding: [0, 10, 0, 0],
        },
        ...commonAxis,
      },
      series: [
        {
          name: metricLabel,
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          showSymbol: false, // Only show on hover
          lineStyle: { width: 3, color: '#3b82f6' },
          data: data.map((d) => d.value),
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(59, 130, 246, 0.2)' },
                { offset: 1, color: 'rgba(59, 130, 246, 0)' },
              ],
            },
          },
          label: { show: false },
        },
      ],
    };
  }

  // Pie/Ring Chart
  if (config.chartType === 'pie' || config.chartType === 'ring') {
    const isRing = config.chartType === 'ring';
    return {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e5e7eb',
        textStyle: { color: '#374151' },
        extraCssText: commonTooltip.extraCssText,
      },
      color: COLOR_PALETTE,
      legend: {
        orient: 'vertical',
        right: 10,
        top: 'middle',
        type: 'scroll',
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: '#6b7280' },
      },
      series: [
        {
          name: metricLabel,
          type: 'pie',
          radius: isRing ? ['50%', '75%'] : ['0%', '75%'],
          center: ['40%', '50%'], // Shift left to make room for legend
          data,
          itemStyle: {
            borderRadius: 5,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: {
            show: false, // Cleaner look, rely on tooltip and legend
            position: 'center',
          },
          emphasis: {
            label: {
              show: isRing, // Only show center label for Ring chart on hover
              fontSize: 16,
              fontWeight: 'bold',
              color: '#374151',
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.2)',
            },
          },
        },
      ],
    };
  }

  return {};
}
