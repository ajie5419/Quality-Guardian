import type { UserSession } from '~/utils/jwt-utils';

import prisma from '~/utils/prisma';

import {
  normalizeInspectionRequestStatus,
  normalizeInspectionRequestText,
  resolveInspectionRequestCurrentUserId,
} from './inspection-request';

export type RequestListQuery = ReturnType<typeof normalizeRequestListQuery>;

export function normalizeRequestListQuery(query: Record<string, unknown>) {
  return {
    currentOnly: String(query.current || '') === 'true',
    includeClosed: String(query.includeClosed || '') === 'true',
    inspectorId: normalizeInspectionRequestText(query.inspectorId),
    keyword: normalizeInspectionRequestText(query.keyword),
    mine: String(query.mine || '') === 'true',
    page: Math.max(Number(query.page || 1), 1),
    pageSize: Math.min(Math.max(Number(query.pageSize || 20), 1), 100),
    processName: normalizeInspectionRequestText(query.processName),
    scope: normalizeRequestListScope(
      normalizeInspectionRequestText(query.scope),
    ),
    statuses: normalizeRequestListStatuses(query.status),
    team: normalizeInspectionRequestText(query.team),
    workOrderNumber: normalizeInspectionRequestText(query.workOrderNumber),
  };
}

const REQUEST_LIST_SCOPE_SET = new Set([
  'abnormal',
  'closed',
  'dispatched',
  'my-inspection',
  'my-report',
  'pending',
]);

/** The completed view only surfaces requests closed within the last 3 days. */
const REQUEST_LIST_CLOSED_WINDOW_DAYS = 3;

function normalizeRequestListScope(value: string) {
  return REQUEST_LIST_SCOPE_SET.has(value) ? value : '';
}
export function getRequestListScopeFromQuery(query: { scope?: null | string }) {
  return normalizeRequestListScope(normalizeInspectionRequestText(query.scope));
}

function normalizeRequestListStatuses(value: unknown) {
  return String(value ?? '')
    .split(',')
    .map((item) => normalizeInspectionRequestStatus(item))
    .filter(Boolean);
}

export async function buildMyRelatedRequestWhere(
  userinfo: UserSession,
): Promise<Record<string, unknown>> {
  const currentUserId = await resolveInspectionRequestCurrentUserId(
    userinfo,
    prisma,
  );
  if (!currentUserId) return { AND: [{ id: '__none__' }] };
  return {
    AND: [
      { OR: [{ inspectorId: currentUserId }, { reporterId: currentUserId }] },
    ],
  };
}

export async function buildRequestListScopeWhere(
  userinfo: UserSession,
  query: RequestListQuery,
  options: { isDispatchHolder: boolean },
): Promise<Record<string, unknown>> {
  switch (query.scope) {
    case 'abnormal': {
      const base = {
        linkedIssueId: { not: null },
        linkedIssueStatus: 'OPEN',
      };
      return options.isDispatchHolder
        ? base
        : {
            ...base,
            ...(await buildMyRelatedRequestWhere(userinfo)),
          };
    }
    case 'closed': {
      const base = {
        status: 'CLOSED',
        closedAt: {
          gte: new Date(
            Date.now() - REQUEST_LIST_CLOSED_WINDOW_DAYS * 24 * 60 * 60 * 1000,
          ),
        },
      };
      return options.isDispatchHolder
        ? base
        : {
            ...base,
            ...(await buildMyRelatedRequestWhere(userinfo)),
          };
    }
    case 'dispatched': {
      // 待检验：已派未检或检验中且无未闭环 NC；不合格单只在 abnormal 视图中出现。
      // 用 AND 数组包裹 OR，避免与关键字搜索的顶层 OR 互相覆盖。
      return {
        status: { in: ['DISPATCHED', 'INSPECTING'] },
        AND: [
          {
            OR: [
              { linkedIssueId: null },
              { linkedIssueStatus: { not: 'OPEN' } },
            ],
          },
        ],
      };
    }
    case 'my-inspection': {
      const currentUserId = await resolveInspectionRequestCurrentUserId(
        userinfo,
        prisma,
      );
      // My inspections: only unfinished requests assigned to the current inspector.
      return {
        inspectorId: currentUserId || undefined,
        status: { in: ['DISPATCHED', 'INSPECTING'] },
      };
    }
    case 'my-report': {
      const currentUserId = await resolveInspectionRequestCurrentUserId(
        userinfo,
        prisma,
      );
      return { reporterId: currentUserId || undefined };
    }
    case 'pending': {
      return { status: 'SUBMITTED' };
    }
    default: {
      return {};
    }
  }
}

export function getRequestListStatusWhere(
  query: RequestListQuery,
): Record<string, unknown> {
  if (query.mine && query.includeClosed) {
    return { status: { in: ['DISPATCHED', 'INSPECTING', 'CLOSED'] } };
  }
  if (query.statuses.length === 1) {
    return { status: query.statuses[0] };
  }
  if (query.statuses.length > 1) {
    return { status: { in: query.statuses } };
  }
  if (query.currentOnly) {
    return { status: { in: ['SUBMITTED', 'DISPATCHED', 'INSPECTING'] } };
  }
  return {};
}
