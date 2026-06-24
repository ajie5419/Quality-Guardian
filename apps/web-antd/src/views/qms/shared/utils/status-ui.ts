import {
  AFTER_SALES_STATUS,
  AFTER_SALES_STATUS_COLOR_MAP,
  ISSUE_TRACKING_STATUS,
  mapAfterSalesStatus,
  normalizeIssueTrackingStatus,
  normalizeQualityLossStatus,
} from '@qgs/shared';

export type QmsStatusType =
  | 'after-sales'
  | 'common'
  | 'file-asset'
  | 'inspection'
  | 'inspection-request'
  | 'issue-tracking'
  | 'quality-loss'
  | 'work-order';

export interface QmsStatusUiConfig {
  color: string;
  text: string;
}

const COMMON_STATUS_UI_MAP: Record<string, QmsStatusUiConfig> = {
  ACTIVE: { color: 'success', text: '启用' },
  CANCELLED: { color: 'default', text: '已取消' },
  CLOSED: { color: 'success', text: '已关闭' },
  COMPLETED: { color: 'success', text: '已完成' },
  DISABLED: { color: 'default', text: '停用' },
  DRAFT: { color: 'default', text: '草稿' },
  EXPIRED: { color: 'error', text: '已过期' },
  FAIL: { color: 'error', text: '不合格' },
  IN_PROGRESS: { color: 'processing', text: '处理中' },
  INACTIVE: { color: 'default', text: '停用' },
  INVALID: { color: 'error', text: '无效' },
  MISSING: { color: 'warning', text: '缺失' },
  NA: { color: 'default', text: '不适用' },
  OPEN: { color: 'warning', text: '待处理' },
  PASS: { color: 'success', text: '合格' },
  PENDING: { color: 'warning', text: '待处理' },
  PROCESSING: { color: 'processing', text: '处理中' },
  PUBLISHED: { color: 'success', text: '已发布' },
  REJECTED: { color: 'error', text: '已退回' },
  RESOLVED: { color: 'success', text: '已解决' },
  SUBMITTED: { color: 'processing', text: '已提交' },
  VALID: { color: 'success', text: '有效' },
  VERIFYING: { color: 'processing', text: '验证中' },
};

const INSPECTION_REQUEST_STATUS_UI_MAP: Record<string, QmsStatusUiConfig> = {
  CANCELLED: { color: 'default', text: '已取消' },
  CLOSED: { color: 'success', text: '已关闭' },
  DISPATCHED: { color: 'processing', text: '已派单' },
  INSPECTING: { color: 'processing', text: '待复检' },
  SUBMITTED: { color: 'warning', text: '已报检' },
};

const INSPECTION_RESULT_STATUS_UI_MAP: Record<string, QmsStatusUiConfig> = {
  CONDITIONAL: { color: 'warning', text: '让步接收' },
  FAIL: { color: 'error', text: '不合格' },
  NA: { color: 'default', text: '不适用' },
  PASS: { color: 'success', text: '合格' },
};

const FILE_ASSET_STATUS_UI_MAP: Record<string, QmsStatusUiConfig> = {
  ACTIVE: { color: 'success', text: '正常' },
  DELETED: { color: 'error', text: '已删除' },
  MISSING: { color: 'warning', text: '文件缺失' },
  ORPHAN: { color: 'default', text: '未引用' },
};

const QUALITY_LOSS_STATUS_UI_MAP: Record<string, QmsStatusUiConfig> = {
  CONFIRMED: { color: 'success', text: '已确认' },
  PENDING: { color: 'warning', text: '待处理' },
  PROCESSING: { color: 'processing', text: '处理中' },
  RESOLVED: { color: 'success', text: '已解决' },
};

const WORK_ORDER_STATUS_UI_MAP: Record<string, QmsStatusUiConfig> = {
  CANCELLED: { color: 'error', text: '已取消' },
  COMPLETED: { color: 'success', text: '已完成' },
  IN_PROGRESS: { color: 'processing', text: '进行中' },
  OPEN: { color: 'warning', text: '未开始' },
};

function normalizeStatusKey(status: unknown) {
  return String(status ?? '')
    .trim()
    .replaceAll(/\s+/g, '_')
    .toUpperCase();
}

function resolveCommonStatusUi(status: unknown): QmsStatusUiConfig {
  const key = normalizeStatusKey(status);
  if (!key) return { color: 'default', text: '-' };
  return (
    COMMON_STATUS_UI_MAP[key] || { color: 'default', text: String(status) }
  );
}

function resolveAfterSalesStatusUi(status: unknown): QmsStatusUiConfig {
  const canonical = mapAfterSalesStatus(status);
  const map: Record<string, QmsStatusUiConfig> = {
    [AFTER_SALES_STATUS.CANCELLED]: { color: 'error', text: '已取消' },
    [AFTER_SALES_STATUS.CLOSED]: { color: 'default', text: '已关闭' },
    [AFTER_SALES_STATUS.COMPLETED]: { color: 'success', text: '已完成' },
    [AFTER_SALES_STATUS.IN_PROGRESS]: { color: 'processing', text: '处理中' },
    [AFTER_SALES_STATUS.NEGOTIATING]: { color: 'processing', text: '协商中' },
    [AFTER_SALES_STATUS.OPEN]: { color: 'warning', text: '待处理' },
    [AFTER_SALES_STATUS.RESOLVED]: { color: 'success', text: '已解决' },
    [AFTER_SALES_STATUS.SUBMITTED]: { color: 'processing', text: '已提交' },
  };
  const config = map[canonical];
  return {
    color:
      config?.color || AFTER_SALES_STATUS_COLOR_MAP[canonical] || 'default',
    text: config?.text || String(status || '-'),
  };
}

function resolveIssueTrackingStatusUi(status: unknown): QmsStatusUiConfig {
  const normalized = normalizeIssueTrackingStatus(status, {
    allowed: [
      ISSUE_TRACKING_STATUS.CLAIMING,
      ISSUE_TRACKING_STATUS.CLOSED,
      ISSUE_TRACKING_STATUS.IN_PROGRESS,
      ISSUE_TRACKING_STATUS.NO_ISSUE,
      ISSUE_TRACKING_STATUS.OPEN,
      ISSUE_TRACKING_STATUS.RESOLVED,
      ISSUE_TRACKING_STATUS.VERIFYING,
    ],
    fallback: ISSUE_TRACKING_STATUS.OPEN,
  });
  const map: Record<string, QmsStatusUiConfig> = {
    [ISSUE_TRACKING_STATUS.CLAIMING]: { color: 'processing', text: '索赔中' },
    [ISSUE_TRACKING_STATUS.CLOSED]: { color: 'success', text: '已关闭' },
    [ISSUE_TRACKING_STATUS.IN_PROGRESS]: {
      color: 'processing',
      text: '处理中',
    },
    [ISSUE_TRACKING_STATUS.NO_ISSUE]: { color: 'default', text: '无问题' },
    [ISSUE_TRACKING_STATUS.OPEN]: { color: 'warning', text: '待处理' },
    [ISSUE_TRACKING_STATUS.RESOLVED]: { color: 'warning', text: '待验证' },
    [ISSUE_TRACKING_STATUS.VERIFYING]: { color: 'processing', text: '验证中' },
  };
  const fallback = map[ISSUE_TRACKING_STATUS.OPEN] as QmsStatusUiConfig;
  return map[normalized] || fallback;
}

function resolveQualityLossStatusUi(status: unknown): QmsStatusUiConfig {
  const normalized = normalizeQualityLossStatus(String(status ?? ''));
  return (
    QUALITY_LOSS_STATUS_UI_MAP[normalizeStatusKey(normalized)] ||
    resolveCommonStatusUi(status)
  );
}

export function resolveQmsStatusUi(
  status: unknown,
  type: QmsStatusType = 'common',
): QmsStatusUiConfig {
  const key = normalizeStatusKey(status);
  if (!key) return { color: 'default', text: '-' };

  if (type === 'after-sales') return resolveAfterSalesStatusUi(status);
  if (type === 'file-asset') {
    return FILE_ASSET_STATUS_UI_MAP[key] || resolveCommonStatusUi(status);
  }
  if (type === 'inspection') {
    return (
      INSPECTION_RESULT_STATUS_UI_MAP[key] || resolveCommonStatusUi(status)
    );
  }
  if (type === 'inspection-request') {
    return (
      INSPECTION_REQUEST_STATUS_UI_MAP[key] || resolveCommonStatusUi(status)
    );
  }
  if (type === 'issue-tracking') return resolveIssueTrackingStatusUi(status);
  if (type === 'quality-loss') return resolveQualityLossStatusUi(status);
  if (type === 'work-order') {
    return WORK_ORDER_STATUS_UI_MAP[key] || resolveCommonStatusUi(status);
  }
  return resolveCommonStatusUi(status);
}
