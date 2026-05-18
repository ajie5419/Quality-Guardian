export const PROJECT_TYPE_OPTIONS = [
  { label: '模具', value: 'MOLD' },
  { label: '车辆', value: 'VEHICLE' },
  { label: '桥梁', value: 'BRIDGE' },
];

export const PROJECT_STATUS_OPTIONS = [
  { label: '计划中', value: 'PLANNED' },
  { label: '进行中', value: 'IN_PROGRESS' },
  { label: '暂停', value: 'PAUSED' },
  { label: '已完成', value: 'COMPLETED' },
];

export const ISSUE_TYPE_OPTIONS = [
  { label: '质量问题', value: 'QUALITY' },
  { label: '进度问题', value: 'PROGRESS' },
  { label: '安全问题', value: 'SAFETY' },
  { label: '其他', value: 'OTHER' },
];

export const ISSUE_STATUS_OPTIONS = [
  { label: '待处理', value: 'OPEN' },
  { label: '处理中', value: 'IN_PROGRESS' },
  { label: '验证中', value: 'VERIFYING' },
  { label: '已关闭', value: 'CLOSED' },
];

export const SEVERITY_OPTIONS = [
  { label: '轻微', value: 'minor' },
  { label: '一般', value: 'major' },
  { label: '严重', value: 'critical' },
];

export const RISK_LEVEL_OPTIONS = [
  { label: '低', value: 'LOW' },
  { label: '中', value: 'MEDIUM' },
  { label: '高', value: 'HIGH' },
  { label: '极高', value: 'CRITICAL' },
];

export const GANTT_VIEW_OPTIONS = [
  { label: '重点关注', value: 'focus' },
  { label: '阶段视图', value: 'stage' },
  { label: '时间轴', value: 'timeline' },
  { label: '全部', value: 'all' },
];

export function statusLabel(value?: string) {
  return (
    PROJECT_STATUS_OPTIONS.find((o) => o.value === value)?.label || value || ''
  );
}

export function projectTypeLabel(value?: string) {
  return (
    PROJECT_TYPE_OPTIONS.find((o) => o.value === value)?.label || value || ''
  );
}

export function projectTypeColor(value?: string) {
  const map: Record<string, string> = {
    BRIDGE: 'purple',
    MOLD: 'blue',
    VEHICLE: 'green',
  };
  return map[value || ''] || 'default';
}

export function projectStatusColor(value?: string) {
  const map: Record<string, string> = {
    COMPLETED: 'green',
    IN_PROGRESS: 'blue',
    PAUSED: 'orange',
    PLANNED: 'default',
  };
  return map[value || ''] || 'default';
}

export function issueStatusColor(value?: string) {
  const map: Record<string, string> = {
    CLOSED: 'green',
    IN_PROGRESS: 'blue',
    OPEN: 'red',
    VERIFYING: 'orange',
  };
  return map[value || ''] || 'default';
}

export function riskColor(value?: string) {
  const map: Record<string, string> = {
    CRITICAL: 'red',
    HIGH: 'orange',
    LOW: 'green',
    MEDIUM: 'gold',
  };
  return map[value || ''] || 'default';
}

export function planTaskLabel(value?: string) {
  const map: Record<string, string> = {
    DELAYED: '已逾期',
    DONE: '已完成',
    DUE_SOON: '临期',
    IN_PROGRESS: '进行中',
    NOT_STARTED: '未开始',
    RISK: '风险',
  };
  return map[value || ''] || value || '';
}

export function planTaskColor(value?: string) {
  const map: Record<string, string> = {
    DELAYED: 'red',
    DONE: 'green',
    DUE_SOON: 'orange',
    IN_PROGRESS: 'blue',
    NOT_STARTED: 'default',
    RISK: 'purple',
  };
  return map[value || ''] || 'default';
}

export function formatPlanTaskDate(value?: string) {
  if (!value) return '-';
  return value.slice(0, 10);
}
