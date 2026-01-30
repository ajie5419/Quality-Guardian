import { WorkOrderStatusEnum as Status } from '#/api/qms/enums';

// ============================================
// 1. Work Order Status Configuration
// ============================================

type StatusConfig = {
  color: string;
  defaultText: string;
  icon?: string;
  textKey: string;
};

export const WORK_ORDER_STATUS_UI_MAP = {
  [Status.OPEN]: {
    color: 'orange',
    textKey: 'qms.workOrder.status.open',
    defaultText: 'Open',
    icon: 'lucide:clock',
  },
  [Status.IN_PROGRESS]: {
    color: 'blue',
    textKey: 'qms.workOrder.status.inProgress',
    defaultText: 'In Progress',
    icon: 'lucide:loader-2',
  },
  [Status.COMPLETED]: {
    color: 'green',
    textKey: 'qms.workOrder.status.completed',
    defaultText: 'Completed',
    icon: 'lucide:check-circle',
  },
  [Status.CANCELLED]: {
    color: 'red',
    textKey: 'qms.workOrder.status.cancelled',
    defaultText: 'Cancelled',
    icon: 'lucide:ban',
  },
} as const satisfies Record<Status, StatusConfig>;

/**
 * Safely get status UI configuration with fallback
 * @param status - Status value from API
 * @returns StatusConfig object with color, text, icon, etc.
 */
export const getWorkOrderStatusUI = (
  status: string | undefined,
): StatusConfig => {
  if (!status) return WORK_ORDER_STATUS_UI_MAP[Status.OPEN];

  const normalized = status.toUpperCase() as Status;
  return (
    WORK_ORDER_STATUS_UI_MAP[normalized] || {
      color: 'default',
      textKey: 'qms.workOrder.status.unknown',
      defaultText: status,
      icon: 'lucide:help-circle',
    }
  );
};

// ============================================
// 2. API Constants
// ============================================

export const QMS_API = {
  WORK_ORDER: {
    BASE: '/qms/work-order',
    LIST: '/qms/work-order/list',
    CREATE: '/qms/work-order/create',
    UPDATE: '/qms/work-order/update',
    DELETE: '/qms/work-order/delete',
    BATCH_DELETE: '/qms/work-order/batch-delete',
    IMPORT: '/qms/work-order/import',
    EXPORT: '/qms/work-order/export',
    SUMMARY: '/qms/work-order/summary',
  },
} as const;

/**
 * Derived type for API path names
 */
export type WorkOrderApiPath =
  (typeof QMS_API.WORK_ORDER)[keyof typeof QMS_API.WORK_ORDER];

// Chart Constants
export const CHART_COLORS = [
  '#5470c6',
  '#91cc75',
  '#fac858',
  '#ee6666',
  '#73c0de',
  '#3ba272',
  '#fc8452',
  '#9a60b4',
  '#ea7ccc',
];

/**
 * 稳定的颜色映射函数
 * 确保同一名称总是获得相同的颜色，无论数据排序如何
 *
 * 使用字符串哈希算法将名称映射到颜色索引
 *
 * @param name - 部门名称
 * @returns 稳定的颜色值
 *
 * @example
 * getStableColor('北京事业部') // 始终返回 '#5470c6'
 * getStableColor('上海事业部') // 始终返回 '#91cc75'
 */
export function getStableColor(name: string): string {
  // 简单的字符串哈希算法
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    const char = name.codePointAt(i) ?? 0;
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  const index = Math.abs(hash) % CHART_COLORS.length;
  return CHART_COLORS[index] ?? CHART_COLORS[0] ?? '#000000';
}

export const CHART_CONFIG = {
  PIE: {
    RADIUS: ['65%', '85%'],
    CENTER: ['50%', '42%'],
    ITEM_STYLE: {
      borderRadius: 6,
      borderColor: '#fff',
      borderWidth: 2,
    },
    LABEL: {
      show: false,
      position: 'center',
    },
    EMPHASIS_LABEL: {
      show: true,
      fontSize: 16,
      fontWeight: 'bold',
      formatter: '{b}\n{d}%',
    },
  },
};

// ============================================
// 3. Import Constants
// ============================================

/** Excel 字段映射表（支持中文/英文/别名） */
export const WORK_ORDER_FIELD_MAP: Record<string, string[]> = {
  workOrderNumber: ['工单号', '工单编号', 'Work Order Number'],
  customerName: ['客户名称', '客户', 'Customer'],
  projectName: ['项目名称', '项目', 'Project Name'],
  division: ['事业部', '部门', 'Division'],
  quantity: ['数量', '工单数量', 'Quantity'],
  status: ['状态', '工单状态', 'Status'],
  deliveryDate: ['交货日期', '计划交期', '交货时间', 'Delivery Date'],
  effectiveTime: ['生效日期', '合同生效日期', '生效时间', 'Effective Date'],
};

/** 导入状态值映射表（与 STATUS_MAPPING_TABLE 保持一致） */
export const IMPORT_STATUS_MAP: Record<string, string> = {
  // 进行中
  IN_PROGRESS: 'IN_PROGRESS',
  'IN PROGRESS': 'IN_PROGRESS',
  进行中: 'IN_PROGRESS',
  处理中: 'IN_PROGRESS',
  InProgress: 'IN_PROGRESS',
  PROCESSING: 'IN_PROGRESS',
  // 已完成
  COMPLETED: 'COMPLETED',
  已完成: 'COMPLETED',
  Completed: 'COMPLETED',
  DONE: 'COMPLETED',
  已结束: 'COMPLETED',
  // 未开始/待处理 - 全部映射到 OPEN
  PENDING: 'OPEN',
  未开始: 'OPEN',
  Pending: 'OPEN',
  OPEN: 'OPEN',
  待处理: 'OPEN',
  // 已取消
  CANCELLED: 'CANCELLED',
  已取消: 'CANCELLED',
  Cancelled: 'CANCELLED',
};

/** 支持的导入文件类型 */
export const SUPPORTED_IMPORT_TYPES = {
  extensions: ['.xlsx', '.xls'],
  mimeTypes: [
    // cspell:disable-next-line
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
  ],
};

/** 导入超时时间（毫秒） */
export const IMPORT_TIMEOUT = 120_000;
