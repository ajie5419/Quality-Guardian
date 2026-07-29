/**
 * Shared QMS status, severity, and reporting constants.
 */

// ==================== 严重程度 ====================
export const QMS_SEVERITY_OPTIONS = ['P0 级', 'P1 级', 'P2 级', 'P3 级'];

export const QMS_SEVERITY_LEVELS = [
  {
    value: 'P0',
    label: 'P0 级',
    color: 'red',
    desc: '致命 - 严重安全性能故障，危及生命安全',
  },
  {
    value: 'P1',
    label: 'P1 级',
    color: 'orange',
    desc: '严重 - 主要功能失效，影响正常使用',
  },
  {
    value: 'P2',
    label: 'P2 级',
    color: 'blue',
    desc: '一般 - 功能部分失效，可降级使用',
  },
  {
    value: 'P3',
    label: 'P3 级',
    color: 'green',
    desc: '轻微 - 不影响使用的小问题',
  },
];

// ==================== 通用状态映射 (简版) ====================
export const QMS_STATUS_COLOR_MAP: Record<string, string> = {
  PENDING: 'orange',
  OPEN: 'red',
  IN_PROGRESS: 'blue',
  PROCESSING: 'blue',
  RESOLVED: 'green',
  CLOSED: 'gray',
  CANCELLED: 'default',
};

// ==================== 默认值与集合 ====================
export const QMS_DEFAULT_VALUES = {
  UNCLASSIFIED: '未分类',
  UNASSIGNED: '未分配',
  UNKNOWN_WORK_ORDER: 'UNKNOWN',
};

export const QMS_ROLE_NAMES = {
  INSPECTOR: 'QC',
} as const;

export const QMS_STATUS_OPEN_SET = new Set([
  'IN_PROGRESS',
  'OPEN',
  'PENDING',
  'PROCESSING',
  '处理中',
  '待处理',
]);
