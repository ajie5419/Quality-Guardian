import type { AnalyticsAccessContext } from '~/modules/data-scope';

import type {
  PeriodClosedGroup,
  PeriodRequestStatsContext,
} from './inspection-request-stats-period';

import { requireAnalyticsUser } from '~/modules/data-scope';
import { DeptService } from '~/modules/dept';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import { TeamIdentityService } from '~/modules/team';

import {
  createInspectionRequestStatsAccumulator,
  isInspectorUser,
} from './inspection-request-stats-accumulator';
import { loadInspectionRequestStatsData } from './inspection-request-stats-data';
import {
  inspectionRequestDurationMinutes as durationMinutes,
  resolveInspectionRequestStatsRange as resolveStatsRange,
} from './inspection-request-stats-date';
import {
  collectIdentityIds,
  createIdentityCountRows,
  createInspectorHistoryRows,
  createReinspectionRows,
  normalizeIdentityId,
  UNRESOLVED_IDENTITY_KEY,
  UNRESOLVED_INSPECTOR_NAME,
  UNRESOLVED_SUPPLIER_NAME,
  UNRESOLVED_TEAM_NAME,
} from './inspection-request-stats-identity';
import {
  mergeSameNameCountRows,
  mergeSameNameReinspectionRows,
  resolveProcessDepartmentsById,
} from './inspection-request-stats-merge';
import {
  applyPeriodClosedGroup,
  applyPeriodSubmittedGroup,
  classifyPeriodClosedRow,
  classifyPeriodSubmittedRow,
} from './inspection-request-stats-period';
import { buildInspectionRequestDepartmentStats } from './inspection-request-stats-responsibility';

export const InspectionRequestStatsService = {
  async getRequestStats(
    query: {
      endDate?: string;
      period?: string;
      startDate?: string;
    },
    access: AnalyticsAccessContext,
  ) {
    requireAnalyticsUser(access);
    const { end, start } = resolveStatsRange(query);
    const {
      activeInspectorRequests,
      activeUsers,
      closedGroups,
      pendingDispatchCount,
      pendingInspectionCount,
      submittedGroups,
    } = await loadInspectionRequestStatsData(start, end, access);

    // PERF-QMS-001 / PHASE-2A: identity maps are resolved from the union of
    // the pre-aggregated submitted/closed groups, which is the same id set
    // the legacy full period row read fed into these resolvers.
    const groupRows: Array<{
      supplierId: null | string;
      teamId: null | string;
    }> = [...submittedGroups, ...closedGroups];
    const [supplierNamesById, teamNamesById, teamCanonicalById] =
      await Promise.all([
        SupplierIdentityService.resolveNamesByIds(
          collectIdentityIds(groupRows.map((item) => item.supplierId)),
        ),
        TeamIdentityService.resolveNamesByIds(
          collectIdentityIds(groupRows.map((item) => item.teamId)),
        ),
        TeamIdentityService.resolveCanonicalIds(
          groupRows.map((item) => item.teamId),
        ),
      ]);
    const processDepartmentsById = await resolveProcessDepartmentsById(
      collectIdentityIds(submittedGroups.map((item) => item.processId)),
    );
    const responsibilityDepartments = await DeptService.findActiveByIdsOrNames({
      ids: collectIdentityIds([
        ...submittedGroups.map((item) => item.responsibleDepartmentId),
        ...processDepartmentsById.values(),
      ]),
    });
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
    for (const user of activeUsers.filter((item) => isInspectorUser(item)))
      inspectorStatusMap.set(
        user.id,
        createInspectorStatus(
          user.realName || user.username || '未记录检验员',
          user.id,
        ),
      );
    const getInspectorStatus = (
      inspectorId: null | string,
      inspectorName: string,
    ) => {
      const key = normalizeIdentityId(inspectorId) || UNRESOLVED_IDENTITY_KEY;
      const existing = inspectorStatusMap.get(key);
      if (existing) return existing;
      const created = createInspectorStatus(inspectorName, key);
      inspectorStatusMap.set(key, created);
      return created;
    };
    for (const item of activeInspectorRequests) {
      if (!item.inspectorId) continue;
      const stat = getInspectorStatus(
        item.inspectorId,
        item.inspector?.realName ||
          item.inspector?.username ||
          UNRESOLVED_INSPECTOR_NAME,
      );
      stat.activeTaskCount += item.activeTaskCount;
      stat.status = 'BUSY';
      stat.currentTaskMinutes = Math.max(
        stat.currentTaskMinutes,
        durationMinutes(item.earliestStartAt, now),
      );
    }
    for (const group of closedGroups) {
      // Completed tasks follow the same CLOSED + closedAt-in-range rule as
      // the inspector ranking so both surfaces stay consistent.
      const stat = getInspectorStatus(
        group.inspectorId,
        group.inspectorRealName ||
          group.inspectorUsername ||
          UNRESOLVED_INSPECTOR_NAME,
      );
      stat.completedTaskCount += group.requestCount;
      stat.totalTaskMinutes += group.totalTaskMinutes;
      stat.averageTaskMinutes = Math.round(
        stat.totalTaskMinutes / stat.completedTaskCount,
      );
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
    const accumulator = createInspectionRequestStatsAccumulator(start, end);
    const {
      counters,
      dailyTrendMap,
      departmentMap,
      departmentReinspectionMap,
      historyDepartmentMap,
      historyInspectorMap,
      historyTeamMap,
      inspectorMap,
      supplierMap,
      supplierReinspectionMap,
      teamMap,
      teamReinspectionMap,
    } = accumulator;
    const statsContext: PeriodRequestStatsContext = {
      processDepartmentsById,
      teamCanonicalById,
    };
    for (const group of submittedGroups) {
      const classification = classifyPeriodSubmittedRow(
        {
          category: group.category,
          hasLinkedIssue: group.hasLinkedIssue,
          inspectionResult: group.inspectionResult,
          processId: group.processId,
          responsibilityType: group.responsibilityType,
          responsibleDepartmentId: group.responsibleDepartmentId,
          status: group.status,
          supplierId: group.supplierId,
          teamId: group.teamId,
        },
        statsContext,
        group.submittedDate,
      );
      applyPeriodSubmittedGroup(
        accumulator,
        classification,
        group.requestCount,
      );
    }
    for (const group of closedGroups) {
      const classification = classifyPeriodClosedRow(
        {
          category: group.category,
          inspectorId: group.inspectorId,
          supplierId: group.supplierId,
          teamId: group.teamId,
        },
        group.closedDate,
      );
      applyPeriodClosedGroup(
        accumulator,
        classification,
        group.requestCount,
        group.totalTaskMinutes,
      );
    }
    const teamNamesByIdWithDeptFallback = new Map(teamNamesById);
    for (const [departmentId, name] of departmentNamesById) {
      teamNamesByIdWithDeptFallback.set(`dept:${departmentId}`, name);
    }
    const resolveClosedInspectorName = (group: PeriodClosedGroup) =>
      group.inspectorRealName ||
      group.inspectorUsername ||
      UNRESOLVED_INSPECTOR_NAME;
    const inspectorNamesById = new Map(
      closedGroups.flatMap((group) => {
        const inspectorId = normalizeIdentityId(group.inspectorId);
        return inspectorId
          ? [[inspectorId, resolveClosedInspectorName(group)] as const]
          : [];
      }),
    );
    const teamRows = mergeSameNameCountRows(
      createIdentityCountRows(
        teamMap,
        teamNamesByIdWithDeptFallback,
        UNRESOLVED_TEAM_NAME,
      ),
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
      historyByTeam: mergeSameNameCountRows(
        createIdentityCountRows(
          historyTeamMap,
          teamNamesByIdWithDeptFallback,
          UNRESOLVED_TEAM_NAME,
        ),
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
      reinspectionRateByTeam: mergeSameNameReinspectionRows(
        createReinspectionRows(
          teamReinspectionMap,
          teamNamesByIdWithDeptFallback,
          UNRESOLVED_TEAM_NAME,
        ),
      ).map(({ id, name, ...stat }) => ({
        ...stat,
        team: name,
        teamId: id,
      })),
      todayClosedCount: counters.todayClosedCount,
      todayClosedIncomingCount: counters.todayClosedIncomingCount,
      todayClosedProcessCount: counters.todayClosedProcessCount,
      todaySubmittedCount: counters.todaySubmittedCount,
      todaySubmittedIncomingCount: counters.todaySubmittedIncomingCount,
      todaySubmittedProcessCount: counters.todaySubmittedProcessCount,
    };
  },
};
