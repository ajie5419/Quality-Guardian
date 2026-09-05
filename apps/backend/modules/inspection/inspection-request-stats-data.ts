import type { AnalyticsAccessContext } from '~/modules/data-scope';

import type {
  PeriodClosedGroup,
  PeriodSubmittedGroup,
} from './inspection-request-stats-period';

import { Prisma } from '@prisma/client';
import { requireAnalyticsUser } from '~/modules/data-scope';
import prisma from '~/utils/prisma';

import { buildRequestHistoryRawScopeSql } from './inspection-request-history.service';
import { buildScopedInspectionRequestWhere } from './inspection-request-scope';

/**
 * Aggregated active-task row (one per inspector). earliestStartAt is the
 * MIN(COALESCE(dispatchedAt, submittedAt)) start, which yields the max
 * currentTaskMinutes with the same durationMinutes formula the legacy
 * per-row loop applied.
 */
export type InspectionRequestStatsActiveInspectorAggregate = {
  activeTaskCount: number;
  earliestStartAt: Date;
  inspector: null | {
    id: string;
    realName: null | string;
    username: null | string;
  };
  inspectorId: string;
};

const activeUserSelect = {
  id: true,
  realName: true,
  username: true,
  roles: {
    select: {
      name: true,
      rbac_role_permissions: {
        select: { permission: { select: { code: true } } },
      },
    },
  },
  rbac_user_roles: {
    select: {
      role: {
        select: {
          name: true,
          rbac_role_permissions: {
            select: { permission: { select: { code: true } } },
          },
        },
      },
    },
  },
} satisfies Prisma.usersSelect;

export type InspectionRequestStatsActiveUser = Prisma.usersGetPayload<{
  select: typeof activeUserSelect;
}>;

export interface InspectionRequestStatsData {
  activeInspectorRequests: InspectionRequestStatsActiveInspectorAggregate[];
  activeUsers: InspectionRequestStatsActiveUser[];
  closedGroups: PeriodClosedGroup[];
  pendingDispatchCount: number;
  pendingInspectionCount: number;
  submittedGroups: PeriodSubmittedGroup[];
}

/**
 * PERF-QMS-001 / PHASE-2A: period request stats are pre-aggregated in the
 * database (GROUP BY identity/classification dimensions + COUNT, plus the
 * per-row floored duration SUM for closed rows) so Node never loads the full
 * period row set. Both queries embed the resolved request-domain scope
 * fragment (buildRequestHistoryRawScopeSql) so DEPT/SELF/ALL and the
 * fail-closed empty-candidate case match the request list / history reads.
 * The +08:00 date bucketing mirrors formatInspectionRequestStatsDate
 * (Asia/Shanghai wall clock, fixed UTC+8).
 */
async function loadSubmittedPeriodGroups(
  start: Date,
  end: Date,
  access: AnalyticsAccessContext,
): Promise<PeriodSubmittedGroup[]> {
  const user = requireAnalyticsUser(access);
  const scopeSql = await buildRequestHistoryRawScopeSql(
    { userId: user.userId, username: user.username },
    access.dataScope,
  );
  const rows = await prisma.$queryRaw<
    Array<{
      category: null | string;
      hasLinkedIssue: boolean | number;
      inspectionResult: string;
      processId: null | string;
      requestCount: bigint | number;
      responsibilityType: null | string;
      responsibleDepartmentId: null | string;
      status: string;
      submittedDate: string;
      supplierId: null | string;
      teamId: null | string;
    }>
  >(Prisma.sql`
    SELECT
      DATE_FORMAT(DATE_ADD(request_row.submittedAt, INTERVAL 8 HOUR), '%Y-%m-%d') AS submittedDate,
      request_row.category AS category,
      request_row.responsibilityType AS responsibilityType,
      request_row.supplierId AS supplierId,
      request_row.teamId AS teamId,
      request_row.responsibleDepartmentId AS responsibleDepartmentId,
      request_row.processId AS processId,
      request_row.status AS status,
      request_row.inspectionResult AS inspectionResult,
      (
        (request_row.linkedIssueId IS NOT NULL AND request_row.linkedIssueId <> '')
        OR (request_row.linkedIssueNo IS NOT NULL AND request_row.linkedIssueNo <> '')
      ) AS hasLinkedIssue,
      COUNT(*) AS requestCount
    FROM qms_inspection_requests AS request_row
    WHERE request_row.isDeleted = 0
      AND request_row.submittedAt >= ${start}
      AND request_row.submittedAt < ${end}
      AND request_row.status <> 'CANCELLED'
      ${scopeSql}
    GROUP BY DATE_FORMAT(DATE_ADD(request_row.submittedAt, INTERVAL 8 HOUR), '%Y-%m-%d'),
      request_row.category, request_row.responsibilityType, request_row.supplierId,
      request_row.teamId, request_row.responsibleDepartmentId, request_row.processId,
      request_row.status, request_row.inspectionResult,
      (
        (request_row.linkedIssueId IS NOT NULL AND request_row.linkedIssueId <> '')
        OR (request_row.linkedIssueNo IS NOT NULL AND request_row.linkedIssueNo <> '')
      )
  `);
  return rows.map((row) => ({
    category: row.category as PeriodSubmittedGroup['category'],
    hasLinkedIssue: Boolean(row.hasLinkedIssue),
    inspectionResult: row.inspectionResult,
    processId: row.processId,
    requestCount: Number(row.requestCount),
    responsibilityType: row.responsibilityType,
    responsibleDepartmentId: row.responsibleDepartmentId,
    status: row.status,
    submittedDate: row.submittedDate,
    supplierId: row.supplierId,
    teamId: row.teamId,
  }));
}

async function loadClosedPeriodGroups(
  start: Date,
  end: Date,
  access: AnalyticsAccessContext,
): Promise<PeriodClosedGroup[]> {
  const user = requireAnalyticsUser(access);
  const scopeSql = await buildRequestHistoryRawScopeSql(
    { userId: user.userId, username: user.username },
    access.dataScope,
  );
  const rows = await prisma.$queryRaw<
    Array<{
      category: null | string;
      closedDate: string;
      inspectorId: null | string;
      inspectorRealName: null | string;
      inspectorUsername: null | string;
      requestCount: bigint | number;
      supplierId: null | string;
      teamId: null | string;
      totalTaskMinutes: bigint | null | number;
    }>
  >(Prisma.sql`
    SELECT
      DATE_FORMAT(DATE_ADD(request_row.closedAt, INTERVAL 8 HOUR), '%Y-%m-%d') AS closedDate,
      request_row.category AS category,
      request_row.supplierId AS supplierId,
      request_row.teamId AS teamId,
      request_row.inspectorId AS inspectorId,
      users_row.realName AS inspectorRealName,
      users_row.username AS inspectorUsername,
      COUNT(*) AS requestCount,
      SUM(GREATEST(
        FLOOR(TIMESTAMPDIFF(
          MICROSECOND,
          COALESCE(request_row.dispatchedAt, request_row.submittedAt),
          request_row.closedAt
        ) / 60000000),
        0
      )) AS totalTaskMinutes
    FROM qms_inspection_requests AS request_row
    LEFT JOIN users AS users_row ON users_row.id = request_row.inspectorId
    WHERE request_row.isDeleted = 0
      AND request_row.closedAt IS NOT NULL
      AND request_row.closedAt >= ${start}
      AND request_row.closedAt < ${end}
      AND request_row.status = 'CLOSED'
      ${scopeSql}
    GROUP BY DATE_FORMAT(DATE_ADD(request_row.closedAt, INTERVAL 8 HOUR), '%Y-%m-%d'),
      request_row.category, request_row.supplierId, request_row.teamId,
      request_row.inspectorId, users_row.realName, users_row.username
  `);
  return rows.map((row) => ({
    category: row.category as PeriodClosedGroup['category'],
    closedDate: row.closedDate,
    inspectorId: row.inspectorId,
    inspectorRealName: row.inspectorRealName,
    inspectorUsername: row.inspectorUsername,
    requestCount: Number(row.requestCount),
    supplierId: row.supplierId,
    teamId: row.teamId,
    totalTaskMinutes: Number(row.totalTaskMinutes || 0),
  }));
}

async function loadActiveInspectorRequestAggregates(
  access: AnalyticsAccessContext,
): Promise<InspectionRequestStatsActiveInspectorAggregate[]> {
  const user = requireAnalyticsUser(access);
  const scopeSql = await buildRequestHistoryRawScopeSql(
    { userId: user.userId, username: user.username },
    access.dataScope,
  );
  const rows = await prisma.$queryRaw<
    Array<{
      activeTaskCount: bigint | null | number;
      earliestStartAt: Date;
      inspectorId: string;
      inspectorRealName: null | string;
      inspectorUsername: null | string;
    }>
  >`
    SELECT
      request_row.inspectorId AS inspectorId,
      users_row.realName AS inspectorRealName,
      users_row.username AS inspectorUsername,
      COUNT(*) AS activeTaskCount,
      MIN(COALESCE(request_row.dispatchedAt, request_row.submittedAt)) AS earliestStartAt
    FROM qms_inspection_requests AS request_row
    LEFT JOIN users AS users_row ON users_row.id = request_row.inspectorId
    WHERE request_row.isDeleted = 0
      AND request_row.inspectorId IS NOT NULL
      AND request_row.status IN ('DISPATCHED', 'INSPECTING')
      ${scopeSql}
    GROUP BY request_row.inspectorId, users_row.realName, users_row.username
  `;
  return rows.map((row) => ({
    activeTaskCount: Number(row.activeTaskCount || 0),
    earliestStartAt: row.earliestStartAt,
    inspector: row.inspectorId
      ? {
          id: row.inspectorId,
          realName: row.inspectorRealName,
          username: row.inspectorUsername,
        }
      : null,
    inspectorId: row.inspectorId,
  }));
}

/**
 * Loads every qms_inspection_requests aggregate source for the request stats
 * endpoint (SEC-INSPECTION-REQUEST-ANALYTICS-001). All four request queries
 * are routed through buildScopedInspectionRequestWhere so DEPT/SELF/ALL and
 * the fail-closed empty-candidate case stay identical to the request list /
 * history reads.
 */
export async function loadInspectionRequestStatsData(
  start: Date,
  end: Date,
  access: AnalyticsAccessContext,
): Promise<InspectionRequestStatsData> {
  const [
    submittedGroups,
    closedGroups,
    activeInspectorRequests,
    pendingDispatchCount,
    pendingInspectionCount,
    activeUsers,
  ] = await Promise.all([
    loadSubmittedPeriodGroups(start, end, access),
    loadClosedPeriodGroups(start, end, access),
    loadActiveInspectorRequestAggregates(access),
    prisma.qms_inspection_requests.count({
      where: await buildScopedInspectionRequestWhere(
        { isDeleted: false, status: 'SUBMITTED' },
        access,
      ),
    }),
    prisma.qms_inspection_requests.count({
      where: await buildScopedInspectionRequestWhere(
        {
          isDeleted: false,
          status: { in: ['DISPATCHED', 'INSPECTING'] },
        },
        access,
      ),
    }),
    prisma.users.findMany({
      where: { isDeleted: false, status: 'ACTIVE' },
      select: activeUserSelect,
    }),
  ]);
  return {
    activeInspectorRequests,
    activeUsers,
    closedGroups,
    pendingDispatchCount,
    pendingInspectionCount,
    submittedGroups,
  };
}
