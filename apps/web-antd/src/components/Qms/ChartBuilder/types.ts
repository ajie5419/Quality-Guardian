export interface ChartConfig {
  id: string;
  title: string;
  dimension: string;
  metric: string;
  chartType: 'bar' | 'pie' | 'line' | 'ring';
  colSpan?: number; // 1-12
}

export interface ChartOptionItem {
  label: string;
  value: string;
}
