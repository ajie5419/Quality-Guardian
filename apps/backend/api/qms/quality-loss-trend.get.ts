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
    console.error('Failed to fetch quality loss trend:', error);
    return useResponseError(
      `Failed to fetch quality loss trend: ${(error as Error).message}`,
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

  // Optimization: Fetch ALL data for the year in 3 parallel queries
  const [allManual, allInternal, allExternal] = await Promise.all([
    prisma.quality_losses.findMany({
      where: { isDeleted: false, occurDate: { gte: yearStart, lte: now } },
      select: { occurDate: true, amount: true },
    }),
    prisma.quality_records.findMany({
      where: { isDeleted: false, date: { gte: yearStart, lte: now } },
      select: { date: true, lossAmount: true },
    }),
    prisma.after_sales.findMany({
      where: { isDeleted: false, occurDate: { gte: yearStart, lte: now } },
      select: { occurDate: true, materialCost: true, laborTravelCost: true },
    }),
  ]);

  const trend = periods.map((p) => {
    const manualTotal = allManual
      .filter((item) => {
        const d = new Date(item.occurDate);
        return d >= p.start && d <= p.end;
      })
      .reduce((sum, item) => sum + Number(item.amount), 0);

    const internalTotal = allInternal
      .filter((item) => {
        const d = new Date(item.date);
        return d >= p.start && d <= p.end;
      })
      .reduce((sum, item) => sum + Number(item.lossAmount), 0);

    const externalTotal = allExternal
      .filter((item) => {
        const d = new Date(item.occurDate);
        return d >= p.start && d <= p.end;
      })
      .reduce(
        (sum, item) =>
          sum +
          Number(item.materialCost || 0) +
          Number(item.laborTravelCost || 0),
        0,
      );

    const totalAmount = manualTotal + internalTotal + externalTotal;
    return {
      period: p.label,
      totalAmount: Number(totalAmount.toFixed(2)),
      manualAmount: Number(manualTotal.toFixed(2)),
      internalAmount: Number(internalTotal.toFixed(2)),
      externalAmount: Number(externalTotal.toFixed(2)),
    };
  });

  return { trend };
}

async function getDrillDownData(period: string, granularity: string) {
  const range = getPeriodRangeFromTrend(period, granularity);
  if (!range) return { drillDown: [], period };
  const { end, start } = range;
  interface QualityLossDetailItem {
    amount: number;
    date: string;
    dept: string;
    desc: string;
    id: string;
    source: string;
    type: string;
  }
  const details: QualityLossDetailItem[] = [];
  const formatDate = (date: Date) => date.toISOString().split('T')[0];

  const [manualLosses, internalLosses, externalLosses] = await Promise.all([
    prisma.quality_losses.findMany({
      where: { isDeleted: false, occurDate: { gte: start, lte: end } },
      orderBy: { occurDate: 'desc' },
    }),
    prisma.quality_records.findMany({
      where: { isDeleted: false, date: { gte: start, lte: end } },
      orderBy: { date: 'desc' },
    }),
    prisma.after_sales.findMany({
      where: { isDeleted: false, occurDate: { gte: start, lte: end } },
      orderBy: { occurDate: 'desc' },
    }),
  ]);

  manualLosses.forEach((item) => {
    details.push({
      id: item.lossId || item.id,
      date: formatDate(item.occurDate),
      type: '其他损失',
      amount: Number(item.amount),
      dept: item.respDept || '-',
      desc: item.description || '-',
      source: 'Manual',
    });
  });
  internalLosses.forEach((item) => {
    details.push({
      id: `INT-${item.serialNumber}`,
      date: formatDate(item.date),
      type: '内部损失',
      amount: Number(item.lossAmount),
      dept: item.responsibleDepartment,
      desc: item.description || '-',
      source: 'Internal',
    });
  });
  externalLosses.forEach((item) => {
    const amount =
      Number(item.materialCost || 0) + Number(item.laborTravelCost || 0);
    details.push({
      id: `EXT-${item.serialNumber}`,
      date: formatDate(item.occurDate),
      type: '外部损失',
      amount: Number(amount.toFixed(2)),
      dept: item.respDept || '-',
      desc: item.issueDescription || '-',
      source: 'External',
    });
  });

  details.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  return { drillDown: details, period };
}

function getPeriodRangeFromTrend(periodLabel: string, granularity: string) {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  yearStart.setHours(0, 0, 0, 0);

  if (granularity === 'week') {
    const tempDate = new Date(yearStart);
    const d = tempDate.getDay() || 7;
    tempDate.setDate(tempDate.getDate() - d + 1);
    while (tempDate.getTime() <= now.getTime()) {
      const weekStart = new Date(tempDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      if (
        (weekEnd.getFullYear() === now.getFullYear() ||
          weekStart.getFullYear() === now.getFullYear()) &&
        `W${getWeekNumber(weekStart)}` === periodLabel
      )
        return { start: weekStart, end: weekEnd };
      tempDate.setDate(tempDate.getDate() + 7);
    }
  } else {
    for (let i = 0; i < 12; i++) {
      const monthStart = new Date(now.getFullYear(), i, 1);
      const monthEnd = new Date(now.getFullYear(), i + 1, 0, 23, 59, 59);
      if (
        monthStart.toLocaleDateString('zh-CN', { month: 'short' }) ===
        periodLabel
      )
        return { start: monthStart, end: monthEnd };
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
