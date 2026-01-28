import type { AfterSalesItem } from '@qgs/shared';

import type { ChartConfig } from '#/components/Qms/ChartBuilder/types';

import { aggregateChartData } from '#/components/Qms/ChartBuilder/composables/useChartCore';
import { findNameById } from '#/types';

import { CHART_DIMENSIONS, CHART_METRICS } from '../constants';

export { type ChartConfig };

export function getAfterSalesChartOption(
  data: AfterSalesItem[],
  config: ChartConfig,
  deptData?: any[],
): any {
  return aggregateChartData(
    data,
    config,
    CHART_DIMENSIONS,
    CHART_METRICS,
    // Value Calculator
    (item, metric) => {
      if (metric === 'totalLoss') {
        return (
          (Number(item.materialCost) || 0) + (Number(item.laborTravelCost) || 0)
        );
      }
      return Number((item as any)[metric]) || 0;
    },
    // Dimension Extractor
    (item, dimension) => {
      if (dimension === 'reportMonth') {
        // issueDate: YYYY-MM-DD
        return (item.issueDate || '').slice(0, 7);
      }

      const val = (item as any)[dimension];
      if (!val) return '未分类';

      if (
        (dimension === 'division' || dimension === 'responsibleDept') &&
        deptData
      ) {
        return findNameById(deptData, val) || String(val);
      }

      return String(val);
    },
  );
}

export function renderCustomChart(
  renderFn: (option: any) => void,
  data: AfterSalesItem[],
  config: ChartConfig,
  deptData?: any[],
) {
  if (!renderFn) return;
  const option = getAfterSalesChartOption(data, config, deptData);
  if (option) {
    renderFn(option);
  }
}
