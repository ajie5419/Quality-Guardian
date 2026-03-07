import { defineEventHandler, getQuery } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  createPassRateTargetResolver,
  getPassRateDrillDownByRange,
} from '~/utils/pass-rate';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const query = getQuery(event);
  const granularity = (query.granularity as unknown as string) || 'week';
  const period = query.period as unknown as string;

  try {
    const getTargetPassRate = await createPassRateTargetResolver();

    if (period)
      return useResponseSuccess(
        await getDrillDownData(period, granularity, getTargetPassRate),
      );
    return useResponseSuccess(await getTrendData(granularity));
  } catch (error) {
    logApiError('pass-rate-trend', error);
    return internalServerErrorResponse(
      event,
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
    // Generate only the most recent 4 weeks
    const currentWeekStart = new Date(now);
    const dayOfWeek = currentWeekStart.getDay() || 7;
    currentWeekStart.setDate(currentWeekStart.getDate() - dayOfWeek + 1);
    currentWeekStart.setHours(0, 0, 0, 0);

    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setDate(currentWeekStart.getDate() - i * 7);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const weekNum = getWeekNumber(weekStart);
      periods.push({ label: `W${weekNum}`, start: weekStart, end: weekEnd });
    }
  } else {
    const months = [
      '1月',
      '2月',
      '3月',
      '4月',
      '5月',
      '6月',
      '7月',
      '8月',
      '9月',
      '10月',
      '11月',
      '12月',
    ];
    for (let i = 0; i < 12; i++) {
      const monthStart = new Date(now.getFullYear(), i, 1);
      const monthEnd = new Date(now.getFullYear(), i + 1, 0, 23, 59, 59);
      periods.push({
        label: months[i] ?? '',
        start: monthStart,
        end: monthEnd,
      });
    }
  }

  // Optimization: Fetch ALL inspections and NCRs for the year in parallel
  const [allInspections, allNCRs] = await Promise.all([
    prisma.inspections.findMany({
      where: {
        isDeleted: false,
        inspectionDate: { gte: yearStart, lte: now },
      },
      select: { inspectionDate: true, result: true, quantity: true },
    }),
    prisma.quality_records.findMany({
      where: {
        isDeleted: false,
        date: { gte: yearStart, lte: now },
      },
      select: { date: true, quantity: true },
    }),
  ]);

  const trend = periods.map((p) => {
    const periodInspections = allInspections.filter((ins) => {
      const d = new Date(ins.inspectionDate);
      return d >= p.start && d <= p.end;
    });

    const periodNCRs = allNCRs.filter((ncr) => {
      const d = new Date(ncr.date);
      return d >= p.start && d <= p.end;
    });

    const totalQty = periodInspections.reduce(
      (sum, i) => sum + (i.quantity || 1),
      0,
    );
    const passedQty = periodInspections
      .filter((ins) => ins.result === 'PASS')
      .reduce((sum, i) => sum + (i.quantity || 1), 0);

    const ncrQty = periodNCRs.reduce((sum, i) => sum + (i.quantity || 0), 0);

    const effectiveTotal = Math.max(totalQty, ncrQty);
    const netPassed = Math.max(0, passedQty - ncrQty);

    let passRate: null | number = 100;
    if (effectiveTotal > 0) {
      passRate = Number(((netPassed / effectiveTotal) * 100).toFixed(1));
    } else if (p.start > now) {
      // Future month with no data
      passRate = null;
    } else {
      // Past/Current month with no data
      passRate = 100;
    }

    return {
      period: p.label,
      passRate,
      totalCount: effectiveTotal,
      passCount: netPassed,
    };
  });

  return { trend };
}

async function getDrillDownData(
  period: string,
  granularity: string,
  getTargetPassRate: (name?: string) => number,
) {
  const range = getPeriodRangeFromTrend(period, granularity);
  if (!range) return { drillDown: [], period };
  const drillDown = await getPassRateDrillDownByRange(
    range.start,
    range.end,
    getTargetPassRate,
  );
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
    const months = [
      '1月',
      '2月',
      '3月',
      '4月',
      '5月',
      '6月',
      '7月',
      '8月',
      '9月',
      '10月',
      '11月',
      '12月',
    ];
    const index = months.indexOf(periodLabel);
    if (index !== -1) {
      const monthStart = new Date(now.getFullYear(), index, 1);
      const monthEnd = new Date(now.getFullYear(), index + 1, 0, 23, 59, 59);
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
