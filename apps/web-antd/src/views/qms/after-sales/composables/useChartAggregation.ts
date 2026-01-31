import type { AfterSalesItem } from '@qgs/shared';

import type { ECOption as EChartsOption } from '@vben/plugins/echarts';

import type { ChartConfig } from '#/components/Qms/ChartBuilder/types';
import type { DeptTreeNode } from '#/types';

import { aggregateChartData } from '#/components/Qms/ChartBuilder/composables/useChartCore';
import { findNameById } from '#/types';

import { CHART_DIMENSIONS, CHART_METRICS } from '../constants';

export { type ChartConfig };

export function getAfterSalesChartOption(
  data: AfterSalesItem[],
  config: ChartConfig,
  t: (key: string) => string,
  deptData?: DeptTreeNode[],
): EChartsOption | null {
  return aggregateChartData(
    data,
    config,
    CHART_DIMENSIONS.map((d) => ({ ...d, label: t(d.label) })),
    CHART_METRICS.map((m) => ({ ...m, label: t(m.label) })),
    // Value Calculator
    (item, metric) => {
      if (metric === 'totalLoss') {
        return (
          (Number(item.materialCost) || 0) + (Number(item.laborTravelCost) || 0)
        );
      }
      return Number(item[metric as keyof AfterSalesItem]) || 0;
    },
    // Dimension Extractor
    (item, dimension) => {
      if (dimension === 'reportMonth') {
        // issueDate: YYYY-MM-DD
        return (item.issueDate || '').slice(0, 7);
      }

      const val = item[dimension as keyof AfterSalesItem];
      if (!val) return t('common.unclassified');

      if (
        (dimension === 'division' || dimension === 'responsibleDept') &&
        deptData
      ) {
        return findNameById(deptData, val as string) || String(val);
      }

      return String(val);
    },
  );
}

export function renderCustomChart(
  renderFn: (option: any, clear?: boolean) => any,
  data: AfterSalesItem[],
  config: ChartConfig,
  t: (key: string) => string,
  deptData?: DeptTreeNode[],
) {
  if (!renderFn) return;
  const option = getAfterSalesChartOption(data, config, t, deptData);
  if (option) {
    renderFn(option);
  }
}
