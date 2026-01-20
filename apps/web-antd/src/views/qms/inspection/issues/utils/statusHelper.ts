import type { InspectionIssue } from '../types';
import { IssueStatus } from '../types';

import { ISSUE_STATUS_UI_MAP } from '../constants';

/**
 * 状态映射表：支持多种格式（中英文）到枚举的转换
 */
const STATUS_KEY_MAP: Record<string, IssueStatus> = {
  // 英文
  OPEN: IssueStatus.OPEN,
  IN_PROGRESS: IssueStatus.IN_PROGRESS,
  CLOSED: IssueStatus.CLOSED,
  // 中文
  开启: IssueStatus.OPEN,
  进行中: IssueStatus.IN_PROGRESS,
  已关闭: IssueStatus.CLOSED,
  待处理: IssueStatus.OPEN,
  处理中: IssueStatus.IN_PROGRESS,
};

/**
 * 获取状态枚举值
 */
export function getStatusKey(status: string | IssueStatus): IssueStatus {
  const s = String(status || '').toUpperCase();
  return STATUS_KEY_MAP[s] || STATUS_KEY_MAP[status] || (s as IssueStatus);
}

/**
 * 获取状态颜色
 */
export function getStatusColor(status: string | IssueStatus): string {
  const key = getStatusKey(status);
  return ISSUE_STATUS_UI_MAP[key]?.color || 'default';
}

/**
 * 获取状态标签文本
 */
export function getStatusLabel(status: string | IssueStatus): string {
  const key = getStatusKey(status);
  const config = ISSUE_STATUS_UI_MAP[key];
  return config?.label || String(status);
}

/**
 * 检查是否已关闭
 */
export function isStatusClosed(issue: InspectionIssue): boolean {
  return issue.status === IssueStatus.CLOSED;
}

/**
 * 检查是否开启或进行中
 */
export function isStatusOpenOrInProgress(issue: InspectionIssue): boolean {
  return (
    issue.status === IssueStatus.OPEN ||
    issue.status === IssueStatus.IN_PROGRESS
  );
}
