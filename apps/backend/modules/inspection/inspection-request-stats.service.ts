import type { ReinspectionCounts } from './inspection-request-stats-identity';

import { DeptService } from '~/modules/dept';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import { TeamIdentityService } from '~/modules/team';
import prisma from '~/utils/prisma';

import {
  addInspectionRequestStatsDays as addDays,
  inspectionRequestDurationMinutes as durationMinutes,
  formatInspectionRequestStatsDate as formatShanghaiDate,
  resolveInspectionRequestStatsRange as resolveStatsRange,
} from './inspection-request-stats-date';
import {
  collectIdentityIds,
  createIdentityCountRows,
  createInspectorHistoryRows,
  createReinspectionRows,
  incrementReinspectionCounts,
  isIncomingInspectionRequest,
  normalizeIdentityId,
  UNRESOLVED_IDENTITY_KEY,
  UNRESOLVED_INSPECTOR_NAME,
  UNRESOLVED_SUPPLIER_NAME,
  UNRESOLVED_TEAM_NAME,
} from './inspection-request-stats-identity';
import { buildInspectionRequestDepartmentStats } from './inspection-request-stats-responsibility';

const INSPECTION_EXECUTION_CODES = new Set(['QMS:Inspection:Requests:Close']);

function hasInspectionExecutionCode(codes: string[]) {
  return codes.some((code) => INSPECTION_EXECUTION_CODES.has(code));
}

export const InspectionRequestStatsService = {
  async getRequestStats(query: {
    endDate?: string;
    period?: string;
    startDate?: string;
  }) {
    const { end, start } = resolveStatsRange(query);
    const [
      periodRequests,
      activeInspectorRequests,
      pendingDispatchCount,
      pendingInspectionCount,
      activeUsers,
    ] = await Promise.all([
      prisma.qms_inspection_requests.findMany({
        select: {
          category: true,
          closedAt: true,
          dispatchedAt: true,
          inspectionResult: true,
          inspector: { select: { id: true, realName: true, username: true } },
          inspectorId: true,
          linkedIssueId: true,
          linkedIssueNo: true,
          status: true,
          submittedAt: true,
          supplierId: true,
          responsibilityType: true,
          responsibleDepartmentId: true,
          teamId: true,
        },
        where: {
          OR: [
            { submittedAt: { gte: start, lt: end } },
            { closedAt: { gte: start, lt: end } },
          ],
          isDeleted: false,
        },
      }),
      prisma.qms_inspection_requests.findMany({
        select: {
          dispatchedAt: true,
          inspector: { select: { id: true, realName: true, username: true } },
          inspectorId: true,
          submittedAt: true,
        },
        where: {
          inspectorId: { not: null },
          isDeleted: false,
          status: { in: ['DISPATCHED', 'INSPECTING'] },
        },
      }),
      prisma.qms_inspection_requests.count({
        where: { isDeleted: false, status: 'SUBMITTED' },
      }),
      prisma.qms_inspection_requests.count({
        where: {
          isDeleted: false,
          status: { in: ['DISPATCHED', 'INSPECTING'] },
        },
      }),
      prisma.users.findMany({
        where: { isDeleted: false, status: 'ACTIVE' },
        select: {
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
        },
      }),
    ]);
    const [
      supplierNamesById,
      teamNamesById,
      teamCanonicalById,
      responsibilityDepartments,
    ] = await Promise.all([
      SupplierIdentityService.resolveNamesByIds(
        collectIdentityIds(periodRequests.map((item) => item.supplierId)),
      ),
      TeamIdentityService.resolveNamesByIds(
        collectIdentityIds(periodRequests.map((item) => item.teamId)),
      ),
      TeamIdentityService.resolveCanonicalIds(
        periodRequests.map((item) => item.teamId),
      ),
      DeptService.findActiveByIdsOrNames({
        ids: collectIdentityIds(
          periodRequests.map((item) => item.responsibleDepartmentId),
        ),
      }),
    ]);
    const departmentNamesById = new Map(
      responsibilityDepartments.map((department) => [
        department.id,
        department.name,
      ]),
    );
    const now = new Date();
    const inspectorStatusMap = new Map<
      string,
      {
        activeTaskCount: number;
        averageTaskMinutes: number;
        completedTaskCount: number;
        currentTaskMinutes: number;
        inspector: string;
        inspectorId: string;
        status: 'BUSY' | 'IDLE';
        totalTaskMinutes: number;
      }
    >();
    const createInspectorStatus = (inspector: string, inspectorId = '') => ({
      activeTaskCount: 0,
      averageTaskMinutes: 0,
      completedTaskCount: 0,
      currentTaskMinutes: 0,
      inspectorId,
      inspector,
      status: 'IDLE' as const,
      totalTaskMinutes: 0,
    });
    const collectRolePermissionCodes = (role?: {
      rbac_role_permissions?: Array<{
        permission?: null | { code?: null | string };
      }>;
    }) =>
      role
        ? (role.rbac_role_permissions || [])
            .map((item) => item.permission?.code || '')
            .filter(Boolean)
        : [];
    const isInspectorUser = (user: (typeof activeUsers)[number]) =>
      [
        user.roles,
        ...user.rbac_user_roles.map((link) => link.role).filter(Boolean),
      ].some((role) =>
        hasInspectionExecutionCode(collectRolePermissionCodes(role)),
      );
    for (const user of activeUsers.filter((item) => isInspectorUser(item)))
      inspectorStatusMap.set(
        user.id,
        createInspectorStatus(
          user.realName || user.username || '未记录检验员',
          user.id,
        ),
      );
    type InspectorRequest =
      | (typeof activeInspectorRequests)[number]
      | (typeof periodRequests)[number];
    const resolveInspectorKey = (item: InspectorRequest) =>
      normalizeIdentityId(item.inspectorId) || UNRESOLVED_IDENTITY_KEY;
    const resolveInspectorName = (item: InspectorRequest) =>
      item.inspector?.realName ||
      item.inspector?.username ||
      UNRESOLVED_INSPECTOR_NAME;
    const getInspectorStatus = (item: InspectorRequest) => {
      const key = resolveInspectorKey(item);
      const existing = inspectorStatusMap.get(key);
      if (existing) return existing;
      const created = createInspectorStatus(resolveInspectorName(item), key);
      inspectorStatusMap.set(key, created);
      return created;
    };
    for (const item of activeInspectorRequests) {
      if (!item.inspectorId) continue;
      const stat = getInspectorStatus(item);
      stat.activeTaskCount += 1;
      stat.status = 'BUSY';
      stat.currentTaskMinutes = Math.max(
        stat.currentTaskMinutes,
        durationMinutes(item.dispatchedAt || item.submittedAt, now),
      );
    }
    for (const item of periodRequests) {
      // Completed tasks follow the same CLOSED + closedAt-in-range rule as
      // the inspector ranking so both surfaces stay consistent.
      if (
        item.closedAt &&
        item.closedAt >= start &&
        item.closedAt < end &&
        item.status === 'CLOSED'
      ) {
        const stat = getInspectorStatus(item);
        const taskMinutes = durationMinutes(
          item.dispatchedAt || item.submittedAt,
          item.closedAt,
        );
        stat.completedTaskCount += 1;
        stat.totalTaskMinutes += taskMinutes;
        stat.averageTaskMinutes = Math.round(
          stat.totalTaskMinutes / stat.completedTaskCount,
        );
      }
    }
    const inspectorStatus = [...inspectorStatusMap.values()]
      .filter((item) => item.inspector !== UNRESOLVED_INSPECTOR_NAME)
      .sort((a, b) => {
        if (a.status === b.status) {
          return (
            b.activeTaskCount - a.activeTaskCount ||
            b.completedTaskCount - a.completedTaskCount
          );
        }
        return a.status === 'BUSY' ? -1 : 1;
      });
    const teamMap = new Map<string, number>();
    const departmentMap = new Map<string, number>();
    const supplierMap = new Map<string, number>();
    const inspectorMap = new Map<string, number>();
    const historyTeamMap = new Map<string, number>();
    const historyDepartmentMap = new Map<string, number>();
    const teamReinspectionMap = new Map<string, ReinspectionCounts>();
    const departmentReinspectionMap = new Map<string, ReinspectionCounts>();
    const supplierReinspectionMap = new Map<string, ReinspectionCounts>();
    const historyInspectorMap = new Map<
      string,
      {
        averageTaskMinutes: number;
        completedTaskCount: number;
        totalTaskMinutes: number;
      }
    >();
    const dailyTrendMap = new Map<
      string,
      { closedCount: number; date: string; submittedCount: number }
    >();
    let todayClosedCount = 0;
    let todaySubmittedCount = 0;
    let todaySubmittedIncomingCount = 0;
    let todaySubmittedProcessCount = 0;
    let todayClosedIncomingCount = 0;
    let todayClosedProcessCount = 0;
    for (
      let cursor = new Date(start);
      cursor < end;
      cursor = addDays(cursor, 1)
    ) {
      const date = formatShanghaiDate(cursor);
      dailyTrendMap.set(date, { closedCount: 0, date, submittedCount: 0 });
    }
    for (const item of periodRequests) {
      if (
        item.submittedAt >= start &&
        item.submittedAt < end &&
        item.status !== 'CANCELLED'
      ) {
        todaySubmittedCount += 1;
        const date = formatShanghaiDate(item.submittedAt);
        const daily = dailyTrendMap.get(date);
        if (daily) daily.submittedCount += 1;
        const isIncoming = isIncomingInspectionRequest(item);
        const isExternalResponsibility =
          item.responsibilityType === 'SUPPLIER' ||
          item.responsibilityType === 'OUTSOURCING_UNIT';
        const usesSupplierIdentity = isExternalResponsibility || isIncoming;
        const isInternalProcess = !isIncoming && !isExternalResponsibility;
        if (isIncoming) {
          todaySubmittedIncomingCount += 1;
        } else {
          todaySubmittedProcessCount += 1;
        }
        const supplierIdentityKey =
          normalizeIdentityId(item.supplierId) || UNRESOLVED_IDENTITY_KEY;
        const teamIdentityKey = normalizeIdentityId(
          teamCanonicalById.get(item.teamId) ?? item.teamId,
        );
        const departmentIdentityKey =
          normalizeIdentityId(item.responsibleDepartmentId) ||
          UNRESOLVED_IDENTITY_KEY;
        if (usesSupplierIdentity) {
          supplierMap.set(
            supplierIdentityKey,
            (supplierMap.get(supplierIdentityKey) || 0) + 1,
          );
        }
        if (isInternalProcess) {
          departmentMap.set(
            departmentIdentityKey,
            (departmentMap.get(departmentIdentityKey) || 0) + 1,
          );
          historyDepartmentMap.set(
            departmentIdentityKey,
            (historyDepartmentMap.get(departmentIdentityKey) || 0) + 1,
          );
          if (teamIdentityKey) {
            teamMap.set(
              teamIdentityKey,
              (teamMap.get(teamIdentityKey) || 0) + 1,
            );
            historyTeamMap.set(
              teamIdentityKey,
              (historyTeamMap.get(teamIdentityKey) || 0) + 1,
            );
          }
        }
        const reinspectionMap = usesSupplierIdentity
          ? supplierReinspectionMap
          : departmentReinspectionMap;
        const reinspectionKey = usesSupplierIdentity
          ? supplierIdentityKey
          : departmentIdentityKey;
        // Reinspection is measured against closed requests only: in-flight
        // FAIL records (status not CLOSED) never count as inspected or
        // reinspected before the inspection flow completes, and requests
        // already inspected but not yet closed stay out of the denominator.
        const hasClosed = item.status === 'CLOSED';
        const hasReinspection =
          hasClosed &&
          (Boolean(item.linkedIssueId || item.linkedIssueNo) ||
            item.inspectionResult === 'FAIL');
        const hasInspectionResult = hasClosed;
        incrementReinspectionCounts(
          reinspectionMap,
          reinspectionKey,
          hasInspectionResult,
          hasReinspection,
        );
        if (isInternalProcess && teamIdentityKey) {
          incrementReinspectionCounts(
            teamReinspectionMap,
            teamIdentityKey,
            hasInspectionResult,
            hasReinspection,
          );
        }
      }
      if (
        item.closedAt &&
        item.closedAt >= start &&
        item.closedAt < end &&
        item.status === 'CLOSED'
      ) {
        todayClosedCount += 1;
        const closedIsIncoming = isIncomingInspectionRequest(item);
        if (closedIsIncoming) {
          todayClosedIncomingCount += 1;
        } else {
          todayClosedProcessCount += 1;
        }
        const date = formatShanghaiDate(item.closedAt);
        const daily = dailyTrendMap.get(date);
        if (daily) daily.closedCount += 1;
        const inspectorId = normalizeIdentityId(item.inspectorId);
        const inspectorKey = inspectorId || UNRESOLVED_IDENTITY_KEY;
        inspectorMap.set(
          inspectorKey,
          (inspectorMap.get(inspectorKey) || 0) + 1,
        );
        const existing = historyInspectorMap.get(inspectorKey) || {
          averageTaskMinutes: 0,
          completedTaskCount: 0,
          totalTaskMinutes: 0,
        };
        const taskMinutes = durationMinutes(
          item.dispatchedAt || item.submittedAt,
          item.closedAt,
        );
        existing.completedTaskCount += 1;
        existing.totalTaskMinutes += taskMinutes;
        existing.averageTaskMinutes = Math.round(
          existing.totalTaskMinutes / existing.completedTaskCount,
        );
        historyInspectorMap.set(inspectorKey, existing);
      }
    }
    const inspectorNamesById = new Map(
      periodRequests.flatMap((item) => {
        const inspectorId = normalizeIdentityId(item.inspectorId);
        return inspectorId
          ? [[inspectorId, resolveInspectorName(item)] as const]
          : [];
      }),
    );
    const teamRows = createIdentityCountRows(
      teamMap,
      teamNamesById,
      UNRESOLVED_TEAM_NAME,
    );
    const supplierRows = createIdentityCountRows(
      supplierMap,
      supplierNamesById,
      UNRESOLVED_SUPPLIER_NAME,
    );
    const inspectorRows = createIdentityCountRows(
      inspectorMap,
      inspectorNamesById,
      UNRESOLVED_INSPECTOR_NAME,
    );
    const departmentStats = buildInspectionRequestDepartmentStats({
      departmentNamesById,
      departmentReinspectionMap,
      historyDepartmentMap,
      submittedDepartmentMap: departmentMap,
    });
    return {
      byInspector: inspectorRows.map(({ count, id, name }) => ({
        count,
        inspector: name,
        inspectorId: id,
      })),
      bySupplier: supplierRows.map(({ count, id, name }) => ({
        count,
        supplierId: id,
        team: name,
      })),
      ...departmentStats,
      byTeam: teamRows.map(({ count, id, name }) => ({
        count,
        team: name,
        teamId: id,
      })),
      dailyTrend: [...dailyTrendMap.values()],
      historyByInspector: createInspectorHistoryRows(
        historyInspectorMap,
        inspectorNamesById,
      ),
      historyByTeam: createIdentityCountRows(
        historyTeamMap,
        teamNamesById,
        UNRESOLVED_TEAM_NAME,
      ).map(({ count, id, name }) => ({ count, team: name, teamId: id })),
      inspectorStatus,
      pendingDispatchCount,
      pendingInspectionCount,
      reinspectionRateBySupplier: createReinspectionRows(
        supplierReinspectionMap,
        supplierNamesById,
        UNRESOLVED_SUPPLIER_NAME,
      ).map(({ id, name, ...stat }) => ({
        ...stat,
        supplierId: id,
        team: name,
      })),
      reinspectionRateByTeam: createReinspectionRows(
        teamReinspectionMap,
        teamNamesById,
        UNRESOLVED_TEAM_NAME,
      ).map(({ id, name, ...stat }) => ({
        ...stat,
        team: name,
        teamId: id,
      })),
      todayClosedCount,
      todayClosedIncomingCount,
      todayClosedProcessCount,
      todaySubmittedCount,
      todaySubmittedIncomingCount,
      todaySubmittedProcessCount,
    };
  },
};
