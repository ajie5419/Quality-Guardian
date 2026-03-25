import type { ECOption as EChartsOption } from '@vben/plugins/echarts';

import type {
  AfterSalesChartAggregateItem,
  AfterSalesChartDimension,
  AfterSalesChartMetric,
} from '#/api/qms/after-sales';
import type { ChartConfig } from '#/components/Qms/ChartBuilder/types';
import type { DeptTreeNode } from '#/types';

import { getAfterSalesChartAggregate } from '#/api/qms/after-sales';
import { buildChartOptionFromAggregated } from '#/components/Qms/ChartBuilder/composables/useChartCore';
import { findNameById } from '#/types';

import { CHART_METRICS } from '../constants';

export { type ChartConfig };

type ChartFilterParams = {
  dateMode?: 'month' | 'week' | 'year';
  dateValue?: string;
  year?: number;
};

function normalizeChartRows(
  rows: AfterSalesChartAggregateItem[],
  config: ChartConfig,
  deptData?: DeptTreeNode[],
) {
  if (config.dimension !== 'responsibleDept' || !deptData) {
    return rows;
  }
  return rows.map((row) => ({
    ...row,
    name: findNameById(deptData, row.name) || row.name,
  }));
}

export async function getAfterSalesChartOption(
  config: ChartConfig,
  t: (key: string) => string,
  filters: ChartFilterParams,
  deptData?: DeptTreeNode[],
): Promise<EChartsOption | null> {
  const response = await getAfterSalesChartAggregate({
    ...filters,
    dimension: config.dimension as AfterSalesChartDimension,
    metric: config.metric as AfterSalesChartMetric,
    top: 15,
  });
  const rows = normalizeChartRows(response.items || [], config, deptData);
  return buildChartOptionFromAggregated(
    rows,
    config,
    CHART_METRICS.map((m) => ({ ...m, label: t(m.label) })),
  );
}

export async function renderCustomChart<TOption>(
  renderFn: (option: TOption, clear?: boolean) => unknown,
  config: ChartConfig,
  t: (key: string) => string,
  filters: ChartFilterParams,
  deptData?: DeptTreeNode[],
) {
  if (!renderFn) return;
  const option = await getAfterSalesChartOption(config, t, filters, deptData);
  if (option) {
    renderFn(option as TOption);
  }
}
