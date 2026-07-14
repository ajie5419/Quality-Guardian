import type { ComputedRef } from 'vue';

import type { DictionaryOptionItem } from '#/api/system/dictionary';

import { computed } from 'vue';

import { useI18n } from '@vben/locales';

import {
  AFTER_SALES_STATUS,
  AFTER_SALES_STATUS_COLOR_MAP,
  isKnownAfterSalesStatusInput,
  mapAfterSalesStatus,
} from '@qgs/shared';

// ==================== 产品选项 ====================

// ==================== 缺陷选项 ====================

// ==================== 严重程度选项 ====================

export const SEVERITY_TOOLTIPS = [
  { level: 'P0级-致命', desc: '严重安全性能故障，危及生命安全，无法安全使用' },
  { level: 'P1级-严重', desc: '主要功能失效，影响正常使用，需维修' },
  { level: 'P2级-一般', desc: '功能部分失效，可降级使用' },
  { level: 'P3级-轻微', desc: '不影响使用的小问题' },
];

// ==================== 状态选项 ====================
export interface StatusOption {
  value: string;
  label: string;
  color: string;
}

function normalizeStatusKey(value: string) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function buildAfterSalesStatusLabelMap(
  t: ReturnType<typeof useI18n>['t'],
): Record<keyof typeof AFTER_SALES_STATUS, string> {
  return {
    [AFTER_SALES_STATUS.OPEN]: t('qms.afterSales.status.pending'),
    [AFTER_SALES_STATUS.IN_PROGRESS]: t('qms.afterSales.status.processing'),
    [AFTER_SALES_STATUS.SUBMITTED]: t('qms.afterSales.status.processing'),
    [AFTER_SALES_STATUS.NEGOTIATING]: t('qms.afterSales.status.processing'),
    [AFTER_SALES_STATUS.RESOLVED]: t('qms.afterSales.status.resolved'),
    [AFTER_SALES_STATUS.COMPLETED]: t('qms.workOrder.status.completed'),
    [AFTER_SALES_STATUS.CLOSED]: t('qms.afterSales.status.closed'),
    [AFTER_SALES_STATUS.CANCELLED]: t('workOrder.status.cancelled'),
  };
}

function buildStatusInfo(
  status: string,
  labelMap: Record<keyof typeof AFTER_SALES_STATUS, string>,
): { color: string; label: string } {
  const canonical = mapAfterSalesStatus(status);
  return {
    color: AFTER_SALES_STATUS_COLOR_MAP[canonical] || 'default',
    label: labelMap[canonical] || '未知状态',
  };
}

export function useStatusOptions() {
  const { t } = useI18n();

  const labelMap = computed(() => buildAfterSalesStatusLabelMap(t));

  const statusOptions: ComputedRef<StatusOption[]> = computed(() => [
    {
      value: AFTER_SALES_STATUS.IN_PROGRESS,
      label: labelMap.value[AFTER_SALES_STATUS.IN_PROGRESS],
      color: AFTER_SALES_STATUS_COLOR_MAP[AFTER_SALES_STATUS.IN_PROGRESS],
    },
    {
      value: AFTER_SALES_STATUS.COMPLETED,
      label: labelMap.value[AFTER_SALES_STATUS.COMPLETED],
      color: AFTER_SALES_STATUS_COLOR_MAP[AFTER_SALES_STATUS.COMPLETED],
    },
  ]);

  function getStatusInfo(status: string) {
    if (!status) return { label: '-', color: 'default' };
    return buildStatusInfo(status, labelMap.value);
  }

  return { statusOptions, getStatusInfo };
}

export function mapDictionaryOptionsToAfterSalesStatus(
  options: DictionaryOptionItem[] | undefined,
  fallbackOptions: StatusOption[] = [],
): StatusOption[] {
  if (!options || options.length === 0) {
    return fallbackOptions;
  }
  const colorMap: Record<string, string> = {};
  for (const item of fallbackOptions) {
    colorMap[normalizeStatusKey(item.value)] = item.color;
  }
  return options.map((item) => {
    const key = normalizeStatusKey(item.dictKey);
    const canonical = mapAfterSalesStatus(item.dictKey);
    const knownStatus = isKnownAfterSalesStatusInput(item.dictKey);
    return {
      value: item.dictKey,
      label: item.dictValue || item.dictKey,
      color:
        colorMap[key] ||
        (knownStatus ? AFTER_SALES_STATUS_COLOR_MAP[canonical] : undefined) ||
        'default',
    };
  });
}

// ==================== 自定义图表配置 (Labels will be localized in UI) ====================
export const CHART_DIMENSIONS = [
  { label: 'qms.afterSales.columns.reportMonth', value: 'reportMonth' },
  { label: 'qms.afterSales.form.defectType', value: 'defectType' },
  { label: 'qms.afterSales.form.defectSubtype', value: 'defectSubtype' },
  { label: 'qms.afterSales.form.responsibleDept', value: 'responsibleDept' },
  { label: 'qms.afterSales.form.productType', value: 'productType' },
  { label: 'qms.afterSales.form.productSubtype', value: 'productSubtype' },
  { label: 'qms.afterSales.form.supplierBrand', value: 'supplierBrand' },
  { label: 'qms.afterSales.form.severity', value: 'severity' },
  { label: 'qms.afterSales.form.projectName', value: 'projectName' },
  { label: 'qms.afterSales.form.status', value: 'status' },
];

export const CHART_METRICS = [
  { label: 'qms.afterSales.chart.metrics.count', value: 'count' },
  { label: 'qms.afterSales.chart.metrics.totalLoss', value: 'totalLoss' },
  { label: 'qms.afterSales.form.materialCost', value: 'materialCost' },
  { label: 'qms.afterSales.form.laborTravelCost', value: 'laborTravelCost' },
  { label: 'qms.afterSales.form.runningHours', value: 'runningHours' },
  { label: 'qms.afterSales.form.quantity', value: 'quantity' },
];

export function createInitialFormState() {
  return {
    defectSubtype: '焊接缺陷',
    defectType: '制造装配缺陷',
    division: '',
    isClaim: false,
    issueDate: new Date().toISOString().split('T')[0],
    laborTravelCost: 0,
    materialCost: 0,
    partName: '',
    productSubtype: '平板车',
    productType: '车辆产品',
    quantity: 1,
    runningHours: 0,
    severity: 'P2 级',
    status: AFTER_SALES_STATUS.IN_PROGRESS,
    supplierBrand: '',
    supplierBrandId: undefined,
    warrantyStatus: '在保',
    photos: [],
  };
}

export {
  QMS_DEFECT_OPTIONS as DEFECT_OPTIONS,
  QMS_DEFECT_SUBTYPES as DEFECT_SUBTYPES,
  QMS_PRODUCT_OPTIONS as PRODUCT_OPTIONS,
  QMS_PRODUCT_SUBTYPES as PRODUCT_SUBTYPES,
  QMS_SEVERITY_OPTIONS as SEVERITY_OPTIONS,
} from '@qgs/shared';
