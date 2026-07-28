import type { ECOption as EChartsOption } from '@vben/plugins/echarts';

import type {
  AfterSalesChartDimension,
  AfterSalesChartMetric,
} from '#/api/qms/after-sales';
import type { ChartConfig } from '#/components/Qms/ChartBuilder/types';

import { getAfterSalesChartAggregate } from '#/api/qms/after-sales';
import { buildChartOptionFromAggregated } from '#/components/Qms/ChartBuilder/composables/useChartCore';

import { CHART_METRICS } from '../constants';

export { type ChartConfig };

type ChartFilterParams = {
  dateMode?: 'month' | 'week' | 'year';
  dateValue?: string;
  year?: number;
};

export async function getAfterSalesChartOption(
  config: ChartConfig,
  t: (key: string) => string,
  filters: ChartFilterParams,
): Promise<EChartsOption | null> {
  const response = await getAfterSalesChartAggregate({
    ...filters,
    dimension: config.dimension as AfterSalesChartDimension,
    metric: config.metric as AfterSalesChartMetric,
    top: 15,
  });
  return buildChartOptionFromAggregated(
    response.items || [],
    config,
    CHART_METRICS.map((m) => ({ ...m, label: t(m.label) })),
  );
}

export async function renderCustomChart<TOption>(
  renderFn: (option: TOption, clear?: boolean) => unknown,
  config: ChartConfig,
  t: (key: string) => string,
  filters: ChartFilterParams,
) {
  if (!renderFn) return;
  const option = await getAfterSalesChartOption(config, t, filters);
  if (option) {
    renderFn(option as TOption);
  }
}
