import type {
  InspectionRequest,
  InspectionRequestCheckResult,
  InspectionRequestStatus,
} from '@qgs/shared';

import type { Ref } from 'vue';

import { computed } from 'vue';

import {
  ISSUE_TRACKING_STATUS,
  normalizeIssueTrackingStatus,
} from '@qgs/shared';

import {
  getIssueTrackingLabel,
  getIssueTrackingTagColor,
} from '#/views/qms/shared/utils/issue-tracking';
import { resolveQmsStatusUi } from '#/views/qms/shared/utils/status-ui';

interface RequestStatsState {
  inspectorStatus: Array<{
    activeTaskCount: number;
    averageTaskMinutes: number;
    completedTaskCount: number;
    currentTaskMinutes: number;
    inspector: string;
    inspectorId: string;
    status: 'BUSY' | 'IDLE';
  }>;
}

interface UseInspectionRequestPresentationOptions {
  canDelete: Ref<boolean>;
  checkResultOptions: Array<{ label: string; value: string }>;
  requestStats: Ref<RequestStatsState>;
}

export function useInspectionRequestPresentation(
  options: UseInspectionRequestPresentationOptions,
) {
  const { canDelete, checkResultOptions, requestStats } = options;

  const statusOptions = [
    { label: '已报检', value: 'SUBMITTED' },
    { label: '已派单', value: 'DISPATCHED' },
    { label: '待复检', value: 'INSPECTING' },
  ];

  const sortedInspectorStatus = computed(() =>
    [...requestStats.value.inspectorStatus].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'IDLE' ? -1 : 1;
      if (a.status === 'BUSY') {
        return b.currentTaskMinutes - a.currentTaskMinutes;
      }
      return b.completedTaskCount - a.completedTaskCount;
    }),
  );

  const idleInspectorCount = computed(
    () =>
      requestStats.value.inspectorStatus.filter(
        (item) => item.status === 'IDLE',
      ).length,
  );

  const busyInspectorCount = computed(
    () =>
      requestStats.value.inspectorStatus.filter(
        (item) => item.status === 'BUSY',
      ).length,
  );

  const visibleInspectorStatus = computed(() => {
    const idle = sortedInspectorStatus.value
      .filter((item) => item.status === 'IDLE')
      .slice(0, 4);
    const busy = sortedInspectorStatus.value
      .filter((item) => item.status === 'BUSY')
      .slice(0, 4);
    return [...idle, ...busy].slice(0, 8);
  });

  function statusColor(status: InspectionRequestStatus) {
    if (status === 'CLOSED') return 'success';
    if (status === 'DISPATCHED' || status === 'INSPECTING') return 'processing';
    if (status === 'CANCELLED') return 'default';
    return 'warning';
  }

  function statusLabel(status: InspectionRequestStatus) {
    return (
      statusOptions.find((item) => item.value === status)?.label ||
      resolveQmsStatusUi(status, 'inspection-request').text
    );
  }

  function hasLinkedIssue(record: InspectionRequest) {
    return Boolean(record.linkedIssueId || record.linkedIssueNo);
  }

  function isReinspectionPassed(record: InspectionRequest) {
    return record.inspectionResult === 'PASS' && hasLinkedIssue(record);
  }

  function inspectionResultColor(record: InspectionRequest) {
    if (isReinspectionPassed(record)) return 'processing';
    return record.inspectionResult === 'FAIL' ? 'error' : 'success';
  }

  function inspectionResultLabel(record: InspectionRequest) {
    if (record.inspectionResult === 'FAIL') {
      return record.status === 'CLOSED' ? '不合格关闭' : '不合格待复检';
    }
    if (isReinspectionPassed(record)) return '复检合格';
    if (record.status === 'CLOSED') return '合格';
    return '未完成';
  }

  function issueStatusLabel(status?: null | string) {
    const normalized = normalizeIssueTrackingStatus(status, {
      allowed: [
        ISSUE_TRACKING_STATUS.CLAIMING,
        ISSUE_TRACKING_STATUS.OPEN,
        ISSUE_TRACKING_STATUS.IN_PROGRESS,
        ISSUE_TRACKING_STATUS.RESOLVED,
        ISSUE_TRACKING_STATUS.CLOSED,
      ],
      fallback: ISSUE_TRACKING_STATUS.OPEN,
    });
    return getIssueTrackingLabel(normalized, {
      fallbackText: '-',
      labelPreset: 'resolved',
    });
  }

  function issueStatusColor(status?: null | string) {
    const normalized = normalizeIssueTrackingStatus(status, {
      allowed: [
        ISSUE_TRACKING_STATUS.CLAIMING,
        ISSUE_TRACKING_STATUS.OPEN,
        ISSUE_TRACKING_STATUS.IN_PROGRESS,
        ISSUE_TRACKING_STATUS.RESOLVED,
        ISSUE_TRACKING_STATUS.CLOSED,
      ],
      fallback: ISSUE_TRACKING_STATUS.OPEN,
    });
    return getIssueTrackingTagColor(normalized, {
      fallback: 'warning',
      preset: 'request',
    });
  }

  function inspectionQuantityText(record: InspectionRequest) {
    const total = Number(record.quantity || 1);
    const qualified = Number(record.qualifiedQuantity ?? total);
    const unqualified = Number(record.unqualifiedQuantity ?? 0);
    if (record.inspectionResult === 'FAIL' || hasLinkedIssue(record)) {
      const unqualifiedLabel =
        record.inspectionResult === 'FAIL' ? '不合格' : '曾不合格';
      return `合格 ${qualified} / ${unqualifiedLabel} ${unqualified}`;
    }
    if (record.status === 'CLOSED') return `合格 ${qualified}`;
    return '-';
  }

  function checkResultLabel(result: InspectionRequestCheckResult) {
    return (
      checkResultOptions.find((item) => item.value === result)?.label || result
    );
  }

  function formatDateTime(value?: null | string) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('zh-CN', {
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
      month: '2-digit',
      second: '2-digit',
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
    })
      .format(date)
      .replaceAll('/', '-');
  }

  function durationText(start?: null | string, end?: null | string) {
    if (!start) return '-';
    const startMs = new Date(start).getTime();
    const endMs = end ? new Date(end).getTime() : Date.now();
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      endMs < startMs
    ) {
      return '-';
    }

    const totalMinutes = Math.max(0, Math.floor((endMs - startMs) / 60_000));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return `${days}天${hours}小时`;
    if (hours > 0) return `${hours}小时${minutes}分钟`;
    return `${minutes}分钟`;
  }

  function minutesText(value?: number) {
    const totalMinutes = Math.max(0, Math.floor(Number(value || 0)));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}小时${minutes}分钟`;
    return `${minutes}分钟`;
  }

  function waitDuration(record: InspectionRequest) {
    return durationText(
      record.submittedAt,
      record.dispatchedAt || record.closedAt,
    );
  }

  function executeDuration(record: InspectionRequest) {
    return durationText(record.dispatchedAt, record.closedAt);
  }

  function isDirectClosed(record: InspectionRequest) {
    return record.status === 'CLOSED' && !record.dispatchedAt;
  }

  function isClosed(record: InspectionRequest) {
    return record.status === 'CLOSED';
  }

  function isDispatchable(record: InspectionRequest) {
    return canShowDispatchAction(record) && !record.dispatchBlockedReason;
  }

  function canShowDispatchAction(record: InspectionRequest) {
    return record.status === 'SUBMITTED' || record.status === 'DISPATCHED';
  }

  function isCompletable(record: InspectionRequest) {
    return record.status === 'DISPATCHED' || record.status === 'INSPECTING';
  }

  function isSelfDispatched(record: InspectionRequest) {
    return isDirectClosed(record) && Boolean(record.inspectorName);
  }

  function displayInspector(record: InspectionRequest) {
    return (
      record.inspectorName || (record.status === 'CLOSED' ? '未记录' : '-')
    );
  }

  function displayDispatcher(record: InspectionRequest) {
    if (record.dispatcherName) return record.dispatcherName;
    if (isSelfDispatched(record)) return '自派单';
    if (isDirectClosed(record)) return '未派单';
    return '-';
  }

  function displayDispatchTime(record: InspectionRequest) {
    if (record.dispatchedAt) return formatDateTime(record.dispatchedAt);
    if (isDirectClosed(record)) return '未派单';
    return '-';
  }

  function executionDurationLabel(record: InspectionRequest) {
    if (record.dispatchedAt) return '执行';
    if (isDirectClosed(record)) return '总耗时';
    return '执行';
  }

  function displayExecutionDuration(record: InspectionRequest) {
    if (record.dispatchedAt) return executeDuration(record);
    return isDirectClosed(record)
      ? durationText(record.submittedAt, record.closedAt)
      : '-';
  }

  function missingValueClass(value?: null | string) {
    return value ? '' : 'text-gray-400';
  }

  function directClosedClass(record: InspectionRequest) {
    return isDirectClosed(record) ? 'text-gray-400' : '';
  }

  function rowClassName(record: InspectionRequest) {
    return isClosed(record) ? 'inspection-request-row-closed' : '';
  }

  function actionMenuKeys(record: InspectionRequest) {
    const keys = [];
    if (!isClosed(record)) {
      keys.push('qr');
    }
    if (record.inspectionId) {
      keys.push('record');
    }
    if (canDelete.value) {
      keys.push('delete');
    }
    return keys;
  }

  function hasActionMenu(record: InspectionRequest) {
    return actionMenuKeys(record).length > 0;
  }

  return {
    busyInspectorCount,
    idleInspectorCount,
    sortedInspectorStatus,
    statusOptions,
    visibleInspectorStatus,
    actionMenuKeys,
    checkResultLabel,
    canShowDispatchAction,
    directClosedClass,
    displayDispatcher,
    displayDispatchTime,
    displayExecutionDuration,
    displayInspector,
    executeDuration,
    executionDurationLabel,
    formatDateTime,
    hasActionMenu,
    hasLinkedIssue,
    inspectionQuantityText,
    inspectionResultColor,
    inspectionResultLabel,
    isClosed,
    isCompletable,
    isDirectClosed,
    isDispatchable,
    issueStatusColor,
    issueStatusLabel,
    minutesText,
    missingValueClass,
    rowClassName,
    statusColor,
    statusLabel,
    waitDuration,
  };
}
