import { defineEventHandler, getQuery } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const query = getQuery(event);
  const granularity = (query.granularity as string) || 'week';
  const period = query.period as string;

  try {
    if (period)
      return useResponseSuccess(await getDrillDownData(period, granularity));
    return useResponseSuccess(await getTrendData(granularity));
  } catch (error) {
    console.error('Failed to fetch pass rate trend:', error);
    return useResponseError(
      `Failed to fetch pass rate trend: ${(error as Error).message}`,
    );
  }
});

async function getTrendData(granularity: string) {
  const now = new Date();
  interface Period {
    end: Date;
    label: string;
    start: Date;
  }
  const periods: Period[] = [];
  const yearStart = new Date(now.getFullYear(), 0, 1);
  yearStart.setHours(0, 0, 0, 0);

  // Generate periods
  if (granularity === 'week') {
    const tempDate = new Date(yearStart);
    const dayOfWeek = tempDate.getDay() || 7;
    tempDate.setDate(tempDate.getDate() - dayOfWeek + 1);
    for (
      ;
      tempDate.getTime() <= now.getTime();
      tempDate.setDate(tempDate.getDate() + 7)
    ) {
      const weekStart = new Date(tempDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      if (
        weekEnd.getFullYear() === now.getFullYear() ||
        weekStart.getFullYear() === now.getFullYear()
      ) {
        const weekNum = getWeekNumber(weekStart);
        periods.push({ label: `W${weekNum}`, start: weekStart, end: weekEnd });
      }
    }
  } else {
    for (let i = 0; i < 12; i++) {
      const monthStart = new Date(now.getFullYear(), i, 1);
      const monthEnd = new Date(now.getFullYear(), i + 1, 0, 23, 59, 59);
      const monthName = monthStart.toLocaleDateString('zh-CN', {
        month: 'short',
      });
      periods.push({ label: monthName, start: monthStart, end: monthEnd });
    }
  }

  // Optimization: Fetch ALL inspections for the year in ONE query
  const allInspections = await prisma.inspections.findMany({
    where: {
      isDeleted: false,
      date: { gte: yearStart, lte: now },
      category: { not: 'OUTGOING' },
    },
    select: { date: true, result: true },
  });

  const trend = periods.map((p) => {
    const periodInspections = allInspections.filter((ins) => {
      const d = new Date(ins.date);
      return d >= p.start && d <= p.end;
    });

    const total = periodInspections.length;
    const passed = periodInspections.filter(
      (ins) => ins.result === 'PASS',
    ).length;
    const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;

    return {
      period: p.label,
      passRate: Number(passRate),
      totalCount: total,
      passCount: passed,
    };
  });

  return { trend };
}

async function getDrillDownData(period: string, granularity: string) {
  const range = getPeriodRangeFromTrend(period, granularity);
  if (!range) return { drillDown: [], period };
  const { start, end } = range;

  interface DrillDownItem {
    category: string;
    passCount: number;
    passRate: number;
    process: string;
    totalCount: number;
  }
  const drillDown: DrillDownItem[] = [];
  const inspections = await prisma.inspections.findMany({
    where: { isDeleted: false, date: { gte: start, lte: end } },
  });

  // 来料检验
  const incomingTypes = [
    ...new Set(
      inspections
        .filter((i) => i.category === 'INCOMING')
        .map((i) => i.incomingType || '未分类'),
    ),
  ];
  for (const type of incomingTypes) {
    const items = inspections.filter(
      (i) => i.category === 'INCOMING' && (i.incomingType || '未分类') === type,
    );
    const total = items.length;
    const passed = items.filter((i) => i.result === 'PASS').length;
    drillDown.push({
      process: type,
      category: '来料检验',
      passRate: total > 0 ? Number(((passed / total) * 100).toFixed(1)) : 0,
      totalCount: total,
      passCount: passed,
    });
  }

  // 过程检验
  const processes = [
    ...new Set(
      inspections
        .filter((i) => i.category === 'PROCESS')
        .map((i) => i.processName || '未指定'),
    ),
  ];
  for (const proc of processes) {
    const items = inspections.filter(
      (i) => i.category === 'PROCESS' && (i.processName || '未指定') === proc,
    );
    const total = items.length;
    const passed = items.filter((i) => i.result === 'PASS').length;
    drillDown.push({
      process: proc,
      category: '过程检验',
      passRate: total > 0 ? Number(((passed / total) * 100).toFixed(1)) : 0,
      totalCount: total,
      passCount: passed,
    });
  }

  // 成品检验
  const finals = inspections.filter((i) => i.category === 'FINAL');
  if (finals.length > 0) {
    const total = finals.length;
    const passed = finals.filter((i) => i.result === 'PASS').length;
    drillDown.push({
      process: '成品检验',
      category: '成品检验',
      passRate: total > 0 ? Number(((passed / total) * 100).toFixed(1)) : 0,
      totalCount: total,
      passCount: passed,
    });
  }

  return { drillDown, period };
}

function getPeriodRangeFromTrend(periodLabel: string, granularity: string) {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  yearStart.setHours(0, 0, 0, 0);

  if (granularity === 'week') {
    const tempDate = new Date(yearStart);
    const dayOfWeek = tempDate.getDay() || 7;
    tempDate.setDate(tempDate.getDate() - dayOfWeek + 1);
    while (tempDate.getTime() <= now.getTime()) {
      const weekStart = new Date(tempDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      if (
        weekEnd.getFullYear() === now.getFullYear() ||
        weekStart.getFullYear() === now.getFullYear()
      ) {
        const weekNum = getWeekNumber(weekStart);
        if (`W${weekNum}` === periodLabel)
          return { start: weekStart, end: weekEnd };
      }
      tempDate.setDate(tempDate.getDate() + 7);
    }
  } else {
    for (let i = 0; i < 12; i++) {
      const monthStart = new Date(now.getFullYear(), i, 1);
      const monthEnd = new Date(now.getFullYear(), i + 1, 0, 23, 59, 59);
      const label = monthStart.toLocaleDateString('zh-CN', { month: 'short' });
      if (label === periodLabel) return { start: monthStart, end: monthEnd };
    }
  }
  return null;
}

function getWeekNumber(date: Date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - start.getTime();
  const oneWeek = 604_800_000;
  return Math.ceil(diff / oneWeek + 1);
}
