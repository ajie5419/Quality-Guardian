import type { IdentityAggregateItem } from '@qgs/shared';

import type { ECOption as EChartsOption } from '@vben/plugins/echarts';

import type { ChartConfig, ChartOptionItem } from '../types';

interface IdentityChartDatum extends IdentityAggregateItem {
  displayName: string;
  identityKey: string;
}

interface EChartsIdentityDatum {
  displayName: string;
  id?: string;
  identityKey: string;
  name: string;
  resolutionStatus: IdentityAggregateItem['resolutionStatus'];
  value: number;
}

const TIME_DIMENSIONS = new Set(['reportMonth']);

export function buildChartOptionFromAggregated(
  data: IdentityAggregateItem[],
  config: ChartConfig,
  metricOptions: ChartOptionItem[],
): EChartsOption | null {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }
  const normalized = data
    .map((item) => normalizeIdentityDatum(item))
    .sort((a, b) => compareChartRows(a, b, config));
  return generateChartOption(normalized, config, metricOptions);
}

function normalizeIdentityDatum(
  item: IdentityAggregateItem,
): IdentityChartDatum {
  const displayName = String(item.name || 'Unknown');
  return {
    displayName,
    id: item.id,
    identityKey: `${item.resolutionStatus}:${item.id || ''}`,
    name: displayName,
    resolutionStatus: item.resolutionStatus,
    value: Number(item.value || 0),
  };
}

function compareChartRows(
  a: IdentityChartDatum,
  b: IdentityChartDatum,
  config: ChartConfig,
) {
  if (TIME_DIMENSIONS.has(config.dimension)) {
    return compareTimeLabels(a.name, b.name);
  }
  return b.value - a.value;
}

function compareTimeLabels(a: string, b: string) {
  const aTime = parseTimeLabel(a);
  const bTime = parseTimeLabel(b);
  if (aTime !== bTime) return aTime - bTime;
  return a.localeCompare(b);
}

function parseTimeLabel(value: string) {
  const normalized = value.trim();
  const yearMonth = /^(\d{4})-(\d{1,2})$/.exec(normalized);
  if (yearMonth) {
    return Number(yearMonth[1]) * 100 + Number(yearMonth[2]);
  }

  const monthOnly = /^(\d{1,2})\s*月$/.exec(normalized);
  if (monthOnly) {
    return Number(monthOnly[1]);
  }

  const dateValue = Date.parse(normalized);
  return Number.isNaN(dateValue) ? Number.MAX_SAFE_INTEGER : dateValue;
}

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

function toEChartsDatum(item: IdentityChartDatum): EChartsIdentityDatum {
  return {
    displayName: item.displayName,
    ...(item.id ? { id: item.id } : {}),
    identityKey: item.identityKey,
    name: item.identityKey,
    resolutionStatus: item.resolutionStatus,
    value: item.value,
  };
}

function generateChartOption(
  data: IdentityChartDatum[],
  config: ChartConfig,
  metricOptions: ChartOptionItem[],
): EChartsOption {
  const metricLabel =
    metricOptions.find((m) => m.value === config.metric)?.label ||
    config.metric;
  const datumByKey = new Map(data.map((item) => [item.identityKey, item]));
  const getDisplayName = (identityKey: string) =>
    datumByKey.get(identityKey)?.displayName || identityKey;
  const truncateDisplayName = (identityKey: string) => {
    const displayName = getDisplayName(identityKey);
    return displayName.length > 10
      ? `${displayName.slice(0, 10)}...`
      : displayName;
  };

  const commonGrid = {
    left: 20,
    right: 20,
    bottom: 30,
    top: 40,
    containLabel: true,
  };

  const commonAxisLabel = {
    interval: 0,
    rotate: data.length > 5 ? 30 : 0,
    color: '#6b7280',
    formatter: truncateDisplayName,
  };

  const formatCategoryTooltip = (params: unknown) => {
    const items = Array.isArray(params) ? params : [params];
    const first = (items[0] || {}) as Record<string, unknown>;
    const identityKey = String(
      first.axisValue || first.name || first.axisValueLabel || '',
    );
    const category = getDisplayName(identityKey);
    const lines = category ? [category] : [];

    for (const rawItem of items) {
      const item = rawItem as Record<string, unknown>;
      const marker = String(item.marker || '');
      const name = String(item.seriesName || metricLabel);
      const itemData = item.data as Record<string, unknown> | undefined;
      const value = itemData?.value ?? item.value;
      lines.push(`${marker}${name}: ${String(value ?? '')}`);
    }

    return lines.join('<br/>');
  };

  const commonTooltip = {
    trigger: 'axis' as const,
    axisPointer: { type: 'line' as const },
    formatter: formatCategoryTooltip,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: '#374151' },
    extraCssText:
      'box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border-radius: 8px;',
  };

  const commonAxis = {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#6b7280', fontSize: 12 },
    splitLine: {
      show: true,
      lineStyle: { type: 'dashed' as const, color: '#f3f4f6' },
    },
  };
  const seriesData = data.map((item) => toEChartsDatum(item));

  if (config.chartType === 'bar') {
    return {
      tooltip: {
        ...commonTooltip,
        axisPointer: { type: 'shadow' as const },
      },
      grid: commonGrid,
      color: COLOR_PALETTE,
      xAxis: {
        type: 'category',
        data: data.map((item) => item.identityKey),
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
          data: seriesData,
          barMaxWidth: 40,
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: '#60a5fa' },
                { offset: 1, color: '#2563eb' },
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

  if (config.chartType === 'line') {
    return {
      tooltip: commonTooltip,
      grid: commonGrid,
      color: COLOR_PALETTE,
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: data.map((item) => item.identityKey),
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
          showSymbol: false,
          lineStyle: { width: 3, color: '#3b82f6' },
          data: seriesData,
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

  const isRing = config.chartType === 'ring';
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const item = params as {
          data?: Partial<EChartsIdentityDatum>;
          percent?: number;
        };
        const displayName = String(item.data?.displayName || 'Unknown');
        return `${displayName}: ${String(item.data?.value ?? '')} (${Number(item.percent || 0)}%)`;
      },
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
      formatter: getDisplayName,
      textStyle: { color: '#6b7280' },
    },
    series: [
      {
        name: metricLabel,
        type: 'pie',
        radius: isRing ? ['50%', '75%'] : ['0%', '75%'],
        center: ['40%', '50%'],
        data: seriesData,
        itemStyle: {
          borderRadius: 5,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: {
          show: false,
          position: 'center',
          formatter: (params: unknown) => {
            const item = params as { data?: Partial<EChartsIdentityDatum> };
            return String(item.data?.displayName || 'Unknown');
          },
        },
        emphasis: {
          label: {
            show: isRing,
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
