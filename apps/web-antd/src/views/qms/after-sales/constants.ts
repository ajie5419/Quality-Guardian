import type { ComputedRef } from 'vue';

import { computed } from 'vue';

import { useI18n } from '@vben/locales';

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

export function useStatusOptions() {
  const { t } = useI18n();

  const statusOptions: ComputedRef<StatusOption[]> = computed(() => [
    {
      value: 'IN_PROGRESS',
      label: t('qms.afterSales.status.processing'),
      color: 'blue',
    },
    {
      value: 'COMPLETED',
      label: t('qms.workOrder.status.completed'),
      color: 'green',
    },
  ]);

  const statusMap = computed(() => {
    const processing = {
      label: t('qms.afterSales.status.processing'),
      color: 'blue',
    };
    const pending = {
      label: t('qms.afterSales.status.pending'),
      color: 'orange',
    };
    const resolved = {
      label: t('qms.afterSales.status.resolved'),
      color: 'green',
    };
    const closed = { label: t('qms.afterSales.status.closed'), color: 'gray' };
    const completed = {
      label: t('qms.workOrder.status.completed'),
      color: 'green',
    };
    const cancelled = {
      label: t('workOrder.status.cancelled'),
      color: 'red',
    };

    return {
      PENDING: pending,
      IN_PROGRESS: processing,
      'IN PROGRESS': processing,
      PROCESSING: processing,
      RESOLVED: resolved,
      COMPLETED: completed,
      CLOSED: closed,
      CANCELLED: cancelled,
      OPEN: pending,
      待处理: pending,
      处理中: processing,
      已结束: resolved,
      已完成: completed,
      已关闭: closed,
      已取消: cancelled,
    } as Record<string, { color: string; label: string }>;
  });

  function getStatusInfo(status: string) {
    if (!status) return { label: '-', color: 'default' };
    const key = String(status).toUpperCase();
    return (
      statusMap.value[status] ||
      statusMap.value[key] || { label: status, color: 'default' }
    );
  }

  return { statusOptions, statusMap, getStatusInfo };
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
    status: 'IN_PROGRESS',
    supplierBrand: '',
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
