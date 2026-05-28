import dayjs from 'dayjs';

type DailyTrendRow = {
  closedCount: number;
  date: string;
  submittedCount: number;
};

type InspectorChartRow = {
  averageTaskMinutes: number;
  completedTaskCount: number;
  inspector: string;
};

type ReinspectionChartRow = {
  reinspectionRate: number;
  team: string;
};

type TeamChartRow = {
  count: number;
  team: string;
};

export function buildDailyTrendChartOptions(rows: DailyTrendRow[]) {
  return {
    grid: { bottom: 22, left: 12, right: 18, top: 36, containLabel: true },
    legend: { top: 0 },
    series: [
      {
        barMaxWidth: 18,
        data: rows.map((item) => item.submittedCount),
        itemStyle: { borderRadius: [4, 4, 0, 0], color: '#1677ff' },
        name: '报检数量',
        type: 'bar' as const,
      },
      {
        data: rows.map((item) => item.closedCount),
        itemStyle: { color: '#52c41a' },
        name: '完成数量',
        smooth: true,
        symbolSize: 6,
        type: 'line' as const,
      },
    ],
    tooltip: { trigger: 'axis' as const },
    xAxis: {
      axisLabel: {
        color: '#6b7280',
        formatter: (value: string) => dayjs(value).format('MM-DD'),
      },
      data: rows.map((item) => item.date),
      type: 'category' as const,
    },
    yAxis: {
      axisLabel: { color: '#6b7280' },
      minInterval: 1,
      type: 'value' as const,
    },
  };
}

export function buildHistoryInspectorChartOptions(rows: InspectorChartRow[]) {
  return {
    grid: { bottom: 22, left: 16, right: 18, top: 36, containLabel: true },
    legend: { top: 0 },
    series: [
      {
        barMaxWidth: 20,
        data: rows.map((item) => item.completedTaskCount),
        itemStyle: { borderRadius: [4, 4, 0, 0], color: '#13c2c2' },
        name: '完成数量',
        type: 'bar' as const,
      },
      {
        data: rows.map((item) => item.averageTaskMinutes),
        name: '平均时长',
        smooth: true,
        type: 'line' as const,
        yAxisIndex: 1,
      },
    ],
    tooltip: { trigger: 'axis' as const },
    xAxis: {
      axisLabel: { color: '#374151' },
      data: rows.map((item) => item.inspector || '未记录'),
      type: 'category' as const,
    },
    yAxis: [
      {
        axisLabel: { color: '#6b7280' },
        name: '完成',
        type: 'value' as const,
      },
      {
        axisLabel: {
          color: '#6b7280',
          formatter: (value: number) => `${value}分`,
        },
        name: '均时长',
        type: 'value' as const,
      },
    ],
  };
}

export function buildHistoryReinspectionChartOptions(
  rows: ReinspectionChartRow[],
) {
  return {
    grid: { bottom: 16, left: 16, right: 24, top: 12, containLabel: true },
    series: [
      {
        barMaxWidth: 20,
        data: rows.map((item) => item.reinspectionRate),
        itemStyle: {
          borderRadius: [0, 4, 4, 0],
          color: '#fa8c16',
        },
        type: 'bar' as const,
      },
    ],
    tooltip: { trigger: 'axis' as const },
    xAxis: {
      axisLabel: {
        color: '#6b7280',
        formatter: (value: number) => `${value}%`,
      },
      type: 'value' as const,
    },
    yAxis: {
      axisLabel: { color: '#374151' },
      data: rows.map((item) => item.team || '未填写'),
      type: 'category' as const,
    },
  };
}

export function buildHistoryTeamChartOptions(rows: TeamChartRow[]) {
  return {
    grid: { bottom: 16, left: 16, right: 18, top: 12, containLabel: true },
    series: [
      {
        barMaxWidth: 20,
        data: rows.map((item) => item.count),
        itemStyle: {
          borderRadius: [0, 4, 4, 0],
          color: '#1677ff',
        },
        type: 'bar' as const,
      },
    ],
    tooltip: { trigger: 'axis' as const },
    xAxis: { axisLabel: { color: '#6b7280' }, type: 'value' as const },
    yAxis: {
      axisLabel: { color: '#374151' },
      data: rows.map((item) => item.team || '未填写'),
      type: 'category' as const,
    },
  };
}
