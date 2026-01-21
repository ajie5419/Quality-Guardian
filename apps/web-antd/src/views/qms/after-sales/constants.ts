import type { ComputedRef } from 'vue';

import { computed } from 'vue';

import { useI18n } from '@vben/locales';

// ==================== 产品选项 ====================
export const PRODUCT_OPTIONS = ['车辆产品', '路桥产品', '模具产品', '其他'];

export const PRODUCT_SUBTYPES: Record<string, string[]> = {
  车辆产品: ['平板车', '双头车', '抱罐车', '防爆车', '铁水挂车', '其他'],
  路桥产品: ['架桥机', '轮轨提梁机', '轮胎提梁机', '门吊', '一体机', '其他'],
  模具产品: ['风电塔筒模具', '地铁管片模具', '卧式模具', '其他'],
  其他: ['其他'],
};

// ==================== 缺陷选项 ====================
export const DEFECT_OPTIONS = [
  '设计缺陷',
  '制造装配缺陷',
  '零部件质量',
  '维护保养不当',
  '操作不当',
];

export const DEFECT_SUBTYPES: Record<string, string[]> = {
  设计缺陷: ['机械设计', '液压设计', '电气设计', '其他'],
  制造装配缺陷: [
    '焊接缺陷',
    '加工尺寸偏差',
    '漏加工',
    '制造干涉',
    '安装错位',
    '漏油渗油',
    '紧固件松动',
    '其他',
  ],
  零部件质量: ['功能失效', '元器件故障', '本身质量问题', '其他'],
  维护保养不当: [
    '油液变质',
    '紧固件松动',
    '润滑不及时',
    '未按定期点检',
    '其他',
  ],
  操作不当: ['误操作', '超载使用', '恶劣环境作业', '暴力操作', '其他'],
};

// ==================== 严重程度选项 ====================
export const SEVERITY_OPTIONS = ['P0 级', 'P1 级', 'P2 级', 'P3 级'];

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
      value: '处理中',
      label: t('qms.afterSales.status.processing'),
      color: 'blue',
    },
    {
      value: '已结束',
      label: t('qms.afterSales.status.resolved'),
      color: 'green',
    },
    {
      value: '待处理',
      label: t('qms.afterSales.status.pending'),
      color: 'orange',
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

    return {
      PENDING: pending,
      IN_PROGRESS: processing,
      'IN PROGRESS': processing,
      PROCESSING: processing,
      RESOLVED: resolved,
      CLOSED: closed,
      OPEN: pending,
      待处理: pending,
      处理中: processing,
      已结束: resolved,
      已关闭: closed,
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

// ==================== 自定义图表配置 ====================
export const CHART_DIMENSIONS = [
  { label: '报告月份', value: 'reportMonth' },
  { label: '缺陷类型', value: 'defectType' },
  { label: '缺陷子类型', value: 'defectSubtype' },
  { label: '责任部门', value: 'responsibleDept' },
  { label: '产品类型', value: 'productType' },
  { label: '产品子类型', value: 'productSubtype' },
  { label: '供应商', value: 'supplierBrand' },
  { label: '严重程度', value: 'severity' },
  { label: '项目名称', value: 'projectName' },
  { label: '处理状态', value: 'status' },
];

export const CHART_METRICS = [
  { label: '问题数量', value: 'count' },
  { label: '总损失金额', value: 'totalLoss' },
  { label: '材料费用', value: 'materialCost' },
  { label: '人工/差旅费用', value: 'laborTravelCost' },
  { label: '运行工时', value: 'runningHours' },
  { label: '涉及数量', value: 'quantity' },
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
    status: '待处理',
    supplierBrand: '',
    warrantyStatus: '在保',
  };
}
