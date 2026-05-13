import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

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
      pendingDispatchCount,
      pendingInspectionCount,
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
      prisma.qms_inspection_requests.count({
        where: { isDeleted: false, status: 'SUBMITTED' },
      }),
      prisma.qms_inspection_requests.count({
        where: { isDeleted: false, status: 'DISPATCHED' },
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
      const created = {
        activeTaskCount: 0,
        averageTaskMinutes: 0,
        completedTaskCount: 0,
        currentTaskMinutes: 0,
        inspector: resolveInspectorName(item),
        status: 'IDLE' as const,
        totalTaskMinutes: 0,
      };
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

    const byTeam = [...teamMap.entries()]
      .map(([team, count]) => ({ count, team }))
      .sort((a, b) => b.count - a.count);
    const byInspector = [...inspectorMap.entries()]
      .map(([inspector, count]) => ({ count, inspector }))
      .sort((a, b) => b.count - a.count);

    return useResponseSuccess({
      byInspector,
      byTeam,
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
