// import type { EChartsOption } from 'echarts';
import type { QmsInspectionApi } from '#/api/qms/inspection';
import type {
  ChartConfig,
  ChartOptionItem,
} from '#/components/Qms/ChartBuilder/types';

import { aggregateChartData } from '#/components/Qms/ChartBuilder/composables/useChartCore';
import { findNameById } from '#/types';

export const ISSUE_CHART_DIMENSIONS: ChartOptionItem[] = [
  { label: '报告月份', value: 'reportMonth' },
  { label: '缺陷类型', value: 'defectType' },
  { label: '缺陷子类型', value: 'defectSubtype' },
  { label: '责任部门', value: 'responsibleDepartment' },
  { label: '事业部', value: 'division' },
  { label: '状态', value: 'status' },
  { label: '严重程度', value: 'severity' },
  { label: '项目名称', value: 'projectName' },
  { label: '供应商', value: 'supplierName' },
  { label: '是否索赔', value: 'claim' },
];

export const ISSUE_CHART_METRICS: ChartOptionItem[] = [
  { label: '问题数量', value: 'count' },
  { label: '损失金额', value: 'lossAmount' },
  { label: '涉及数量', value: 'quantity' },
];

export function getIssueChartOption(
  data: QmsInspectionApi.InspectionIssue[],
  config: ChartConfig,
  deptData?: any[],
): any {
  return aggregateChartData(
    data,
    config,
    ISSUE_CHART_DIMENSIONS,
    ISSUE_CHART_METRICS,
    (item, metric) => {
      if (metric === 'lossAmount') {
        return Number(item.lossAmount) || 0;
      }
      if (metric === 'quantity') {
        return Number(item.quantity) || 0;
      }
      return 0;
    },
    // 添加维度提取器，处理日期格式
    (item, dimension) => {
      if (dimension === 'reportMonth') {
        // reportDate 格式通常是 YYYY-MM-DD
        return (item.reportDate || '').slice(0, 7);
      }

      const val = (item as any)[dimension];
      if (!val) return '未分类';

      if (
        (dimension === 'division' || dimension === 'responsibleDepartment') &&
        deptData
      ) {
        return findNameById(deptData, val) || String(val);
      }

      return String(val);
    },
  );
}
