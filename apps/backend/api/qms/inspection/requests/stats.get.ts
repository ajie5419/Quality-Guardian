import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

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

function durationMinutes(start: Date, end: Date) {
  const diff = end.getTime() - start.getTime();
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.floor(diff / 60_000);
}

function parsePermissionCodes(raw?: null | string) {
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [] as string[];
  }
}

function hasInspectionExecutionCode(codes: string[]) {
  return codes.some((code) => INSPECTION_EXECUTION_CODES.has(code));
}

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const { end, start } = getShanghaiTodayRange();

  try {
    const [
      todayRequests,
      activeInspectorRequests,
      historyRequests,
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
          status: 'DISPATCHED',
        },
      }),
      prisma.qms_inspection_requests.findMany({
        include: {
          inspector: { select: { id: true, realName: true, username: true } },
        },
        where: { isDeleted: false },
      }),
      prisma.qms_inspection_requests.count({
        where: { isDeleted: false, status: 'SUBMITTED' },
      }),
      prisma.qms_inspection_requests.count({
        where: { isDeleted: false, status: 'DISPATCHED' },
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
              permissions: true,
              rbac_role_permissions: {
                select: {
                  permission: { select: { code: true } },
                },
              },
            },
          },
          rbac_user_roles: {
            select: {
              role: {
                select: {
                  name: true,
                  permissions: true,
                  rbac_role_permissions: {
                    select: {
                      permission: { select: { code: true } },
                    },
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

    function createInspectorStatus(inspector: string) {
      return {
        activeTaskCount: 0,
        averageTaskMinutes: 0,
        completedTaskCount: 0,
        currentTaskMinutes: 0,
        inspector,
        status: 'IDLE' as const,
        totalTaskMinutes: 0,
      };
    }

    function collectRolePermissionCodes(role?: {
      name?: null | string;
      permissions?: null | string;
      rbac_role_permissions?: Array<{
        permission?: null | { code?: null | string };
      }>;
    }) {
      if (!role) return [] as string[];
      return [
        ...parsePermissionCodes(role.permissions),
        ...(role.rbac_role_permissions || [])
          .map((item) => item.permission?.code || '')
          .filter(Boolean),
      ];
    }

    function isInspectorUser(user: (typeof activeUsers)[number]) {
      const roles = [
        user.roles,
        ...user.rbac_user_roles.map((link) => link.role).filter(Boolean),
      ];
      return roles.some((role) =>
        hasInspectionExecutionCode(collectRolePermissionCodes(role)),
      );
    }

    for (const user of activeUsers.filter((item) => isInspectorUser(item))) {
      inspectorStatusMap.set(
        user.id,
        createInspectorStatus(user.realName || user.username || '未记录检验员'),
      );
    }

    function resolveInspectorKey(item: (typeof todayRequests)[number]) {
      return (
        item.inspectorId ||
        item.inspector?.username ||
        item.inspector?.realName ||
        'unknown'
      );
    }

    function resolveInspectorName(item: (typeof todayRequests)[number]) {
      return (
        item.inspector?.realName || item.inspector?.username || '未记录检验员'
      );
    }

    function getInspectorStatus(item: (typeof todayRequests)[number]) {
      const key = resolveInspectorKey(item);
      const existing = inspectorStatusMap.get(key);
      if (existing) return existing;
      const created = createInspectorStatus(resolveInspectorName(item));
      inspectorStatusMap.set(key, created);
      return created;
    }

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

    for (const item of todayRequests) {
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
        if (a.status !== b.status) return a.status === 'BUSY' ? -1 : 1;
        return (
          b.activeTaskCount - a.activeTaskCount ||
          b.completedTaskCount - a.completedTaskCount
        );
      });

    const teamMap = new Map<string, number>();
    const inspectorMap = new Map<string, number>();
    const historyTeamMap = new Map<string, number>();
    const historyInspectorMap = new Map<
      string,
      {
        averageTaskMinutes: number;
        completedTaskCount: number;
        inspector: string;
        totalTaskMinutes: number;
      }
    >();
    let todaySubmittedCount = 0;
    let todayClosedCount = 0;

    for (const item of todayRequests) {
      if (
        item.submittedAt >= start &&
        item.submittedAt < end &&
        item.status !== 'CANCELLED'
      ) {
        todaySubmittedCount += 1;
        const team = String(item.team || '未填写班组').trim();
        teamMap.set(team, (teamMap.get(team) || 0) + 1);
      }

      if (item.closedAt && item.closedAt >= start && item.closedAt < end) {
        todayClosedCount += 1;
        const inspector =
          item.inspector?.realName ||
          item.inspector?.username ||
          '未记录检验员';
        inspectorMap.set(inspector, (inspectorMap.get(inspector) || 0) + 1);
      }
    }

    for (const item of historyRequests) {
      if (item.submittedAt && item.status !== 'CANCELLED') {
        const team = String(item.team || '未填写班组').trim();
        historyTeamMap.set(team, (historyTeamMap.get(team) || 0) + 1);
      }

      if (item.closedAt) {
        const inspector =
          item.inspector?.realName ||
          item.inspector?.username ||
          '未记录检验员';
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

    const byTeam = [...teamMap.entries()]
      .map(([team, count]) => ({ count, team }))
      .sort((a, b) => b.count - a.count);
    const byInspector = [...inspectorMap.entries()]
      .map(([inspector, count]) => ({ count, inspector }))
      .sort((a, b) => b.count - a.count);
    const historyByTeam = [...historyTeamMap.entries()]
      .map(([team, count]) => ({ count, team }))
      .sort((a, b) => b.count - a.count);
    const historyByInspector = [...historyInspectorMap.values()]
      .filter((item) => item.inspector !== '未记录检验员')
      .sort((a, b) => b.completedTaskCount - a.completedTaskCount);

    return useResponseSuccess({
      byInspector,
      byTeam,
      historyByInspector,
      historyByTeam,
      inspectorStatus,
      pendingDispatchCount,
      pendingInspectionCount,
      todayClosedCount,
      todaySubmittedCount,
    });
  } catch (error) {
    logApiError('inspection-request-stats', error);
    return internalServerErrorResponse(event, '获取报检任务统计失败');
  }
});
