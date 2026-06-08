import { INCOMING_INSPECTION_PROCESS_NAME } from '~/modules/inspection/inspection-request';
import prisma from '~/utils/prisma';

const INSPECTION_EXECUTION_CODES = new Set(['QMS:Inspection:Requests:Close']);

function getShanghaiTodayRange(now = new Date()) {
  const shanghaiDate = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).format(now);
  const start = new Date(`${shanghaiDate}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { end, start };
}

function parseShanghaiDate(value?: null | string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatShanghaiDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).format(date);
}

function getPeriodRange(period?: null | string, now = new Date()) {
  const today = getShanghaiTodayRange(now).start;
  switch (period) {
    case 'halfYear': {
      const start = new Date(today);
      start.setMonth(start.getMonth() - 5, 1);
      return { end: addDays(today, 1), start };
    }
    case 'quarter': {
      const start = new Date(today);
      start.setMonth(start.getMonth() - 2, 1);
      return { end: addDays(today, 1), start };
    }
    case 'year': {
      const start = new Date(today);
      start.setMonth(0, 1);
      return { end: addDays(today, 1), start };
    }
    default: {
      const start = new Date(today);
      start.setDate(1);
      return { end: addDays(today, 1), start };
    }
  }
}

function resolveStatsRange(query: {
  endDate?: string;
  period?: string;
  startDate?: string;
}) {
  const customStart = parseShanghaiDate(query.startDate || '');
  const customEnd = parseShanghaiDate(query.endDate || '');
  if (customStart && customEnd && customEnd >= customStart)
    return { end: addDays(customEnd, 1), start: customStart };
  return query.period ? getPeriodRange(query.period) : getShanghaiTodayRange();
}

function durationMinutes(start: Date, end: Date) {
  const diff = end.getTime() - start.getTime();
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.floor(diff / 60_000);
}

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
        include: {
          inspector: { select: { id: true, realName: true, username: true } },
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
        include: {
          inspector: { select: { id: true, realName: true, username: true } },
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
    const now = new Date();
    const inspectorStatusMap = new Map<
      string,
      {
        activeTaskCount: number;
        averageTaskMinutes: number;
        completedTaskCount: number;
        currentTaskMinutes: number;
        inspector: string;
        status: 'BUSY' | 'IDLE';
        totalTaskMinutes: number;
      }
    >();
    const createInspectorStatus = (inspector: string) => ({
      activeTaskCount: 0,
      averageTaskMinutes: 0,
      completedTaskCount: 0,
      currentTaskMinutes: 0,
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
        createInspectorStatus(user.realName || user.username || '未记录检验员'),
      );
    const resolveInspectorKey = (item: (typeof periodRequests)[number]) =>
      item.inspectorId ||
      item.inspector?.username ||
      item.inspector?.realName ||
      'unknown';
    const resolveInspectorName = (item: (typeof periodRequests)[number]) =>
      item.inspector?.realName || item.inspector?.username || '未记录检验员';
    const getInspectorStatus = (item: (typeof periodRequests)[number]) => {
      const key = resolveInspectorKey(item);
      const existing = inspectorStatusMap.get(key);
      if (existing) return existing;
      const created = createInspectorStatus(resolveInspectorName(item));
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
      if (item.closedAt && item.closedAt >= start && item.closedAt < end) {
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
      .filter((item) => item.inspector !== '未记录检验员')
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
    const supplierMap = new Map<string, number>();
    const inspectorMap = new Map<string, number>();
    const historyTeamMap = new Map<string, number>();
    const teamReinspectionMap = new Map<
      string,
      {
        inspectedCount: number;
        reinspectionCount: number;
        reinspectionRate: number;
        submittedCount: number;
        team: string;
      }
    >();
    const supplierReinspectionMap = new Map<
      string,
      {
        inspectedCount: number;
        reinspectionCount: number;
        reinspectionRate: number;
        submittedCount: number;
        team: string;
      }
    >();
    const historyInspectorMap = new Map<
      string,
      {
        averageTaskMinutes: number;
        completedTaskCount: number;
        inspector: string;
        totalTaskMinutes: number;
      }
    >();
    const dailyTrendMap = new Map<
      string,
      { closedCount: number; date: string; submittedCount: number }
    >();
    let todaySubmittedCount = 0;
    let todayClosedCount = 0;
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
        const isIncoming =
          item.processName === INCOMING_INSPECTION_PROCESS_NAME;
        const team = String(item.team || '未填写班组').trim();
        const countMap = isIncoming ? supplierMap : teamMap;
        countMap.set(team, (countMap.get(team) || 0) + 1);
        if (!isIncoming) {
          historyTeamMap.set(team, (historyTeamMap.get(team) || 0) + 1);
        }
        const reinspectionMap = isIncoming
          ? supplierReinspectionMap
          : teamReinspectionMap;
        const reinspectionStat = reinspectionMap.get(team) || {
          inspectedCount: 0,
          reinspectionCount: 0,
          reinspectionRate: 0,
          submittedCount: 0,
          team,
        };
        reinspectionStat.submittedCount += 1;
        const hasReinspection =
          Boolean(item.linkedIssueId || item.linkedIssueNo) ||
          item.inspectionResult === 'FAIL';
        const hasInspectionResult = item.status === 'CLOSED' || hasReinspection;
        if (hasInspectionResult) reinspectionStat.inspectedCount += 1;
        if (hasReinspection) reinspectionStat.reinspectionCount += 1;
        reinspectionStat.reinspectionRate =
          reinspectionStat.inspectedCount > 0
            ? Math.round(
                (reinspectionStat.reinspectionCount /
                  reinspectionStat.inspectedCount) *
                  1000,
              ) / 10
            : 0;
        reinspectionMap.set(team, reinspectionStat);
      }
      if (
        item.closedAt &&
        item.closedAt >= start &&
        item.closedAt < end &&
        item.status === 'CLOSED'
      ) {
        todayClosedCount += 1;
        const date = formatShanghaiDate(item.closedAt);
        const daily = dailyTrendMap.get(date);
        if (daily) daily.closedCount += 1;
        const inspector =
          item.inspector?.realName ||
          item.inspector?.username ||
          '未记录检验员';
        inspectorMap.set(inspector, (inspectorMap.get(inspector) || 0) + 1);
        const existing = historyInspectorMap.get(inspector) || {
          averageTaskMinutes: 0,
          completedTaskCount: 0,
          inspector,
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
        historyInspectorMap.set(inspector, existing);
      }
    }
    return {
      byInspector: [...inspectorMap.entries()]
        .map(([inspector, count]) => ({ count, inspector }))
        .sort((a, b) => b.count - a.count),
      bySupplier: [...supplierMap.entries()]
        .map(([team, count]) => ({ count, team }))
        .sort((a, b) => b.count - a.count),
      byTeam: [...teamMap.entries()]
        .map(([team, count]) => ({ count, team }))
        .sort((a, b) => b.count - a.count),
      dailyTrend: [...dailyTrendMap.values()],
      historyByInspector: [...historyInspectorMap.values()]
        .filter((item) => item.inspector !== '未记录检验员')
        .sort((a, b) => b.completedTaskCount - a.completedTaskCount),
      historyByTeam: [...historyTeamMap.entries()]
        .map(([team, count]) => ({ count, team }))
        .sort((a, b) => b.count - a.count),
      inspectorStatus,
      pendingDispatchCount,
      pendingInspectionCount,
      reinspectionRateBySupplier: [...supplierReinspectionMap.values()].sort(
        (a, b) =>
          b.reinspectionRate - a.reinspectionRate ||
          b.reinspectionCount - a.reinspectionCount ||
          b.inspectedCount - a.inspectedCount ||
          b.submittedCount - a.submittedCount,
      ),
      reinspectionRateByTeam: [...teamReinspectionMap.values()].sort(
        (a, b) =>
          b.reinspectionRate - a.reinspectionRate ||
          b.reinspectionCount - a.reinspectionCount ||
          b.inspectedCount - a.inspectedCount ||
          b.submittedCount - a.submittedCount,
      ),
      todayClosedCount,
      todaySubmittedCount,
    };
  },
};
