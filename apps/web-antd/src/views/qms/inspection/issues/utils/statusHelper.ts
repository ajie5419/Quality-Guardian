import type { InspectionIssue } from '../types';

import { INSPECTION_ISSUE_STATUS, mapInspectionIssueStatus } from '@qgs/domain';

import { ISSUE_STATUS_UI_MAP, SEVERITY_OPTIONS } from '../constants';
import { IssueStatus, Severity } from '../types';

/**
 * 获取状态枚举值
 */
export function getStatusKey(status: IssueStatus | string): IssueStatus {
  return mapInspectionIssueStatus(status) as IssueStatus;
}

/**
 * 获取状态颜色
 */
export function getStatusColor(status: IssueStatus | string): string {
  const key = getStatusKey(status);
  return ISSUE_STATUS_UI_MAP[key]?.color || 'default';
}

/**
 * 获取状态标签文本
 */
export function getStatusLabel(status: IssueStatus | string): string {
  const key = getStatusKey(status);
  const config = ISSUE_STATUS_UI_MAP[key];
  return config?.label || String(status);
}

/**
 * 获取严重程度颜色
 */
export function getSeverityColor(severity: Severity | string): string {
  const option = SEVERITY_OPTIONS.find((o) => o.value === severity);
  return option?.color || 'default';
}

/**
 * 获取严重程度标签
 */
export function getSeverityLabel(severity: Severity | string): string {
  const option = SEVERITY_OPTIONS.find((o) => o.value === severity);
  return option?.label || String(severity || '');
}

/**
 * 检查是否已关闭
 */
export function isStatusClosed(issue: InspectionIssue): boolean {
  return issue.status === INSPECTION_ISSUE_STATUS.CLOSED;
}

/**
 * 检查是否开启或进行中
 */
export function isStatusOpenOrInProgress(issue: InspectionIssue): boolean {
  return (
    issue.status === INSPECTION_ISSUE_STATUS.OPEN ||
    issue.status === INSPECTION_ISSUE_STATUS.IN_PROGRESS
  );
}
