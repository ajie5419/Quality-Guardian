import {
  ISSUE_TRACKING_STATUS,
  normalizeIssueTrackingStatus,
} from '@qgs/shared';

type AntTagColor = 'default' | 'error' | 'processing' | 'success' | 'warning';

type IssueTrackingColorPreset = 'record' | 'report' | 'request';

type IssueTrackingLabelPreset = 'resolved' | 'verify';

function isEmptyStatus(status: unknown) {
  return String(status ?? '').trim() === '';
}

export function getIssueTrackingLabel(
  status: unknown,
  options: {
    fallbackText?: string;
    labelPreset?: IssueTrackingLabelPreset;
  } = {},
) {
  const { fallbackText, labelPreset = 'verify' } = options;
  if (isEmptyStatus(status)) {
    return fallbackText || '待处理';
  }

  const normalized = normalizeIssueTrackingStatus(status, {
    allowed: [
      ISSUE_TRACKING_STATUS.CLAIMING,
      ISSUE_TRACKING_STATUS.NO_ISSUE,
      ISSUE_TRACKING_STATUS.OPEN,
      ISSUE_TRACKING_STATUS.IN_PROGRESS,
      ISSUE_TRACKING_STATUS.RESOLVED,
      ISSUE_TRACKING_STATUS.CLOSED,
    ],
    fallback: ISSUE_TRACKING_STATUS.OPEN,
  });

  if (normalized === ISSUE_TRACKING_STATUS.CLAIMING) return '索赔中';
  if (normalized === ISSUE_TRACKING_STATUS.NO_ISSUE) return '无问题';
  if (normalized === ISSUE_TRACKING_STATUS.OPEN) return '待处理';
  if (normalized === ISSUE_TRACKING_STATUS.IN_PROGRESS) return '处理中';
  if (normalized === ISSUE_TRACKING_STATUS.RESOLVED) {
    return labelPreset === 'resolved' ? '已解决' : '待验证';
  }
  return '已关闭';
}

export function getIssueTrackingTagColor(
  status: unknown,
  options: { fallback?: AntTagColor; preset?: IssueTrackingColorPreset } = {},
): AntTagColor {
  const { fallback = 'default', preset = 'record' } = options;
  if (isEmptyStatus(status)) return fallback;

  const normalized = normalizeIssueTrackingStatus(status, {
    allowed: [
      ISSUE_TRACKING_STATUS.CLAIMING,
      ISSUE_TRACKING_STATUS.NO_ISSUE,
      ISSUE_TRACKING_STATUS.OPEN,
      ISSUE_TRACKING_STATUS.IN_PROGRESS,
      ISSUE_TRACKING_STATUS.RESOLVED,
      ISSUE_TRACKING_STATUS.CLOSED,
    ],
    fallback: ISSUE_TRACKING_STATUS.OPEN,
  });

  if (preset === 'report') {
    if (normalized === ISSUE_TRACKING_STATUS.CLOSED) return 'success';
    if (normalized === ISSUE_TRACKING_STATUS.IN_PROGRESS) return 'processing';
    if (normalized === ISSUE_TRACKING_STATUS.RESOLVED) return 'warning';
    return 'error';
  }

  if (preset === 'request') {
    if (
      normalized === ISSUE_TRACKING_STATUS.CLOSED ||
      normalized === ISSUE_TRACKING_STATUS.RESOLVED
    ) {
      return 'success';
    }
    if (
      normalized === ISSUE_TRACKING_STATUS.IN_PROGRESS ||
      normalized === ISSUE_TRACKING_STATUS.CLAIMING
    ) {
      return 'processing';
    }
    return 'warning';
  }

  if (normalized === ISSUE_TRACKING_STATUS.CLOSED) return 'success';
  if (normalized === ISSUE_TRACKING_STATUS.IN_PROGRESS) return 'processing';
  if (normalized === ISSUE_TRACKING_STATUS.RESOLVED) return 'warning';
  return 'default';
}

export function getIssueTrackingPaletteColor(
  status: unknown,
  options: {
    fallback?: string;
    resolvedColor?: string;
  } = {},
) {
  const { fallback = 'orange', resolvedColor = 'purple' } = options;
  if (isEmptyStatus(status)) return fallback;

  const normalized = normalizeIssueTrackingStatus(status, {
    allowed: [
      ISSUE_TRACKING_STATUS.OPEN,
      ISSUE_TRACKING_STATUS.IN_PROGRESS,
      ISSUE_TRACKING_STATUS.RESOLVED,
      ISSUE_TRACKING_STATUS.CLOSED,
    ],
    fallback: ISSUE_TRACKING_STATUS.OPEN,
  });

  if (normalized === ISSUE_TRACKING_STATUS.CLOSED) return 'green';
  if (normalized === ISSUE_TRACKING_STATUS.IN_PROGRESS) return 'blue';
  if (normalized === ISSUE_TRACKING_STATUS.RESOLVED) return resolvedColor;
  return fallback;
}
