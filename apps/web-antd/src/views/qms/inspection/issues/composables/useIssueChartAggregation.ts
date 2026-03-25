import type {
  InspectionIssueChartDimension,
  InspectionIssueChartMetric,
} from '#/api/qms/inspection';
import type {
  ChartConfig,
  ChartOptionItem,
} from '#/components/Qms/ChartBuilder/types';
import type { DeptTreeNode } from '#/types';

import { getInspectionIssueChartAggregate } from '#/api/qms/inspection';
import { buildChartOptionFromAggregated } from '#/components/Qms/ChartBuilder/composables/useChartCore';
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

type ChartFilterParams = {
  dateMode?: 'month' | 'week' | 'year';
  dateValue?: string;
  year?: number;
};

function normalizeChartRows(
  rows: Array<{ name: string; value: number }>,
  config: ChartConfig,
  deptData?: DeptTreeNode[],
) {
  if (
    config.dimension !== 'division' &&
    config.dimension !== 'responsibleDepartment'
  ) {
    return rows;
  }
  return rows.map((row) => ({
    ...row,
    name: findNameById(deptData || [], row.name) || row.name,
  }));
}

export async function getIssueChartOption(
  config: ChartConfig,
  filters: ChartFilterParams,
  deptData?: DeptTreeNode[],
) {
  const response = await getInspectionIssueChartAggregate({
    ...filters,
    dimension: config.dimension as InspectionIssueChartDimension,
    metric: config.metric as InspectionIssueChartMetric,
    top: 15,
  });
  const rows = normalizeChartRows(response.items || [], config, deptData);
  return buildChartOptionFromAggregated(rows, config, ISSUE_CHART_METRICS);
}

export async function renderCustomChart<TOption>(
  renderFn: (option: TOption, clear?: boolean) => unknown,
  config: ChartConfig,
  filters: ChartFilterParams,
  deptData?: DeptTreeNode[],
) {
  if (!renderFn) return;
  const option = await getIssueChartOption(config, filters, deptData);
  if (option) {
    renderFn(option as TOption);
  }
}
