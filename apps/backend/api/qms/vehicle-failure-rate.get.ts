import { defineEventHandler, getQuery } from 'h3';
import { logApiError } from '~/utils/api-logger';
import prisma from '~/utils/prisma';
import { useResponseSuccess } from '~/utils/response';

const VEHICLE_PRODUCT_TYPE = '车辆产品';
const MANUAL_SETTING_KEY = 'QMS_VEHICLE_FAILURE_LAST_YEAR_MANUAL';

interface MonthWindow {
  currentEnd: Date;
  currentLabel: string;
  currentStart: Date;
  lastYearEnd: Date;
  lastYearLabel: string;
  lastYearStart: Date;
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const endMonth = parseEndMonth(query.month);

  try {
    const windows = getMonthWindows(endMonth);
    const manualData = await getManualData();

    const trend = await Promise.all(
      windows.map(async (window) => {
        const [currentYear, lastYear] = await Promise.all([
          countVehicleFeedback(window.currentStart, window.currentEnd),
          countVehicleFeedback(window.lastYearStart, window.lastYearEnd),
        ]);
        const manualValue = manualData[window.lastYearLabel];

        return {
          currentYear,
          lastYear,
          lastYearManual:
            typeof manualValue === 'number' && Number.isFinite(manualValue)
              ? manualValue
              : null,
          period: window.currentLabel,
        };
      }),
    );

    const rankingWindow = windows.at(-1);
    const ranking = rankingWindow
      ? await buildRanking(windows[0].currentStart, rankingWindow.currentEnd)
      : [];

    return useResponseSuccess({
      ranking,
      trend,
    });
  } catch (error) {
    logApiError('vehicle-failure-rate', error);
    return useResponseSuccess({
      ranking: [],
      trend: [],
    });
  }
});

async function countVehicleFeedback(start: Date, end: Date): Promise<number> {
  return prisma.after_sales.count({
    where: {
      isDeleted: false,
      occurDate: { gte: start, lte: end },
      productType: VEHICLE_PRODUCT_TYPE,
    },
  });
}

async function buildRanking(start: Date, end: Date) {
  const records = await prisma.after_sales.findMany({
    select: {
      defectType: true,
    },
    where: {
      isDeleted: false,
      occurDate: { gte: start, lte: end },
      productType: VEHICLE_PRODUCT_TYPE,
    },
  });

  const total = records.length;
  const counts = new Map<string, number>();

  for (const record of records) {
    const defectType = record.defectType?.trim() || '未分类';
    counts.set(defectType, (counts.get(defectType) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([defectType, count]) => ({
      count,
      defectType,
      percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

async function getManualData(): Promise<Record<string, number>> {
  const setting = await prisma.system_settings.findUnique({
    where: { key: MANUAL_SETTING_KEY },
  });

  if (!setting?.value) {
    return {};
  }

  try {
    const parsed = JSON.parse(setting.value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([month, count]) => [month, Number(count)] as const)
        .filter(([, count]) => Number.isFinite(count)),
    );
  } catch {
    return {};
  }
}

function getMonthWindows(endMonth: Date): MonthWindow[] {
  const windows: MonthWindow[] = [];
  const year = endMonth.getFullYear();
  const endMonthIndex = endMonth.getMonth();

  for (let monthIndex = 0; monthIndex <= endMonthIndex; monthIndex += 1) {
    const currentStart = new Date(year, monthIndex, 1);
    const currentEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
    const lastYearStart = new Date(year - 1, monthIndex, 1);
    const lastYearEnd = new Date(year - 1, monthIndex + 1, 0, 23, 59, 59, 999);

    windows.push({
      currentEnd,
      currentLabel: formatMonth(year, monthIndex),
      currentStart,
      lastYearEnd,
      lastYearLabel: formatMonth(year - 1, monthIndex),
      lastYearStart,
    });
  }

  return windows;
}

function formatMonth(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function parseEndMonth(month: unknown): Date {
  if (typeof month !== 'string' || !month.trim()) {
    return new Date();
  }

  const match = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!match) {
    return new Date();
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthIndex) ||
    monthIndex < 0 ||
    monthIndex > 11
  ) {
    return new Date();
  }

  return new Date(year, monthIndex, 1);
}
