import { defineEventHandler, getQuery } from 'h3';
import { logApiError } from '~/utils/api-logger';
import prisma from '~/utils/prisma';
import { useResponseSuccess } from '~/utils/response';
import { addYearsToDate } from '~/utils/work-order';

const VEHICLE_PRODUCT_TYPE = '车辆产品';
const MANUAL_SETTING_KEY = 'QMS_VEHICLE_FAILURE_LAST_YEAR_MANUAL';
const MANUAL_WARRANTY_SETTING_KEY =
  'QMS_VEHICLE_FAILURE_LAST_YEAR_WARRANTY_MONTHLY_MANUAL';

interface MonthWindow {
  currentEnd: Date;
  currentLabel: string;
  currentStart: Date;
  lastYearEnd: Date;
  lastYearLabel: string;
  lastYearStart: Date;
}

interface YearSeriesItem {
  manualOverrides: boolean[];
  values: number[];
  year: number;
}

interface YearWarrantySeriesItem {
  manualOverrides: boolean[];
  values: number[];
  year: number;
}

interface YearIntensityItem {
  intensityPct: number;
  issueCount: number;
  perVehicle: number;
  warrantyVehicleCount: number;
  year: number;
}

interface WorkOrderWarrantySeed {
  deliveryDate: Date | null;
  quantity: number;
  division: null | string;
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const endMonth = parseEndMonth(query.month);

  try {
    const vehicleDeptIds = await getVehicleDeptIds();
    const windows = getMonthWindows(endMonth);
    const manualData = await getManualData();
    const manualWarrantyData = await getManualWarrantyData();
    const selectedYear = endMonth.getFullYear();
    const years = await getDisplayYears(
      selectedYear,
      endMonth,
      manualData,
      vehicleDeptIds,
    );
    const monthlyCounts = await loadMonthlyCounts(
      years,
      endMonth.getMonth(),
      vehicleDeptIds,
    );
    const monthlyWarrantyCounts = await loadMonthlyWarrantyCounts(
      years,
      endMonth.getMonth(),
      vehicleDeptIds,
    );

    const trend = await Promise.all(
      windows.map((window) => {
        const currentYear = getMonthlyCount(
          monthlyCounts,
          selectedYear,
          getMonthIndex(window.currentLabel),
        );
        const lastYear = getMonthlyCount(
          monthlyCounts,
          selectedYear - 1,
          getMonthIndex(window.currentLabel),
        );
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
    const yearSeries = buildYearSeries(
      years,
      endMonth.getMonth(),
      manualData,
      monthlyCounts,
    );
    const yearWarrantySeries = buildYearWarrantySeries(
      years,
      endMonth.getMonth(),
      manualWarrantyData,
      monthlyWarrantyCounts,
    );
    const yearIntensity = await buildYearIntensity(
      yearSeries,
      endMonth.getMonth(),
      yearWarrantySeries,
    );

    const rankingWindow = windows.at(-1);
    const ranking = rankingWindow
      ? await buildRanking(
          windows[0].currentStart,
          rankingWindow.currentEnd,
          vehicleDeptIds,
        )
      : [];

    return useResponseSuccess({
      ranking,
      trend,
      yearIntensity,
      yearSeries,
      yearWarrantySeries,
    });
  } catch (error) {
    logApiError('vehicle-failure-rate', error);
    return useResponseSuccess({
      ranking: [],
      trend: [],
      yearIntensity: [],
      yearSeries: [],
      yearWarrantySeries: [],
    });
  }
});

async function buildRanking(start: Date, end: Date, vehicleDeptIds: string[]) {
  const records = await prisma.after_sales.findMany({
    select: {
      defectType: true,
    },
    where: {
      isDeleted: false,
      occurDate: { gte: start, lte: end },
      OR: [
        {
          productType: VEHICLE_PRODUCT_TYPE,
        },
        {
          work_orders: {
            ...buildVehicleDivisionWhere(vehicleDeptIds),
            isDeleted: false,
          },
        },
      ],
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

async function getManualWarrantyData(): Promise<Record<string, number>> {
  const setting = await prisma.system_settings.findUnique({
    where: { key: MANUAL_WARRANTY_SETTING_KEY },
  });

  if (!setting?.value) {
    return {};
  }

  try {
    const parsed = JSON.parse(setting.value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([year, count]) => [year, Number(count)] as const)
        .filter(([, count]) => Number.isFinite(count)),
    );
  } catch {
    return {};
  }
}

async function loadMonthlyCounts(
  years: number[],
  endMonthIndex: number,
  vehicleDeptIds: string[],
) {
  if (years.length === 0) {
    return new Map<string, number>();
  }

  const startYear = Math.min(...years);
  const endYear = Math.max(...years);
  const start = new Date(startYear, 0, 1);
  const end = new Date(endYear, endMonthIndex + 1, 0, 23, 59, 59, 999);

  const records = await prisma.after_sales.findMany({
    select: { occurDate: true },
    where: {
      isDeleted: false,
      occurDate: { gte: start, lte: end },
      OR: [
        {
          productType: VEHICLE_PRODUCT_TYPE,
        },
        {
          work_orders: {
            ...buildVehicleDivisionWhere(vehicleDeptIds),
            isDeleted: false,
          },
        },
      ],
    },
  });

  const yearSet = new Set(years);
  const monthlyCounts = new Map<string, number>();

  for (const record of records) {
    const date = record.occurDate;
    if (!(date instanceof Date)) {
      continue;
    }

    const year = date.getFullYear();
    if (!yearSet.has(year)) {
      continue;
    }
    const monthIndex = date.getMonth();
    if (monthIndex > endMonthIndex) {
      continue;
    }
    const key = formatMonth(year, monthIndex);
    monthlyCounts.set(key, (monthlyCounts.get(key) || 0) + 1);
  }

  return monthlyCounts;
}

async function loadMonthlyWarrantyCounts(
  years: number[],
  endMonthIndex: number,
  vehicleDeptIds: string[],
) {
  if (years.length === 0) {
    return new Map<string, number>();
  }

  const startYear = Math.min(...years);
  const endYear = Math.max(...years);
  const minYearStart = new Date(startYear, 0, 1);
  const maxYearEnd = new Date(endYear, 11, 31, 23, 59, 59, 999);
  const minDeliveryDate = addYearsToDate(minYearStart, -1);
  const candidates = await prisma.work_orders.findMany({
    select: {
      deliveryDate: true,
      division: true,
      quantity: true,
    },
    where: {
      isDeleted: false,
      deliveryDate: {
        gt: minDeliveryDate,
        lte: maxYearEnd,
      },
    },
  });

  const vehicleCandidates = candidates.filter((item) =>
    isVehicleDivision(item.division, vehicleDeptIds),
  );

  const monthlyWarrantyCounts = new Map<string, number>();
  for (const year of years) {
    for (let monthIndex = 0; monthIndex <= endMonthIndex; monthIndex += 1) {
      const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
      const count = calculateWarrantyVehicleCountAtPoint(
        vehicleCandidates,
        monthEnd,
      );
      monthlyWarrantyCounts.set(formatMonth(year, monthIndex), count);
    }
  }

  return monthlyWarrantyCounts;
}

function buildYearSeries(
  years: number[],
  endMonthIndex: number,
  manualData: Record<string, number>,
  monthlyCounts: Map<string, number>,
): YearSeriesItem[] {
  return years.map((year) => {
    const values: number[] = [];
    const manualOverrides: boolean[] = [];

    for (let monthIndex = 0; monthIndex <= endMonthIndex; monthIndex += 1) {
      const monthKey = formatMonth(year, monthIndex);
      const manualValue = manualData[monthKey];
      const hasManual =
        typeof manualValue === 'number' && Number.isFinite(manualValue);
      values.push(
        hasManual
          ? manualValue
          : getMonthlyCount(monthlyCounts, year, monthIndex),
      );
      manualOverrides.push(hasManual);
    }

    return {
      manualOverrides,
      values,
      year,
    };
  });
}

function buildYearWarrantySeries(
  years: number[],
  endMonthIndex: number,
  manualWarrantyData: Record<string, number>,
  monthlyWarrantyCounts: Map<string, number>,
): YearWarrantySeriesItem[] {
  return years.map((year) => {
    const values: number[] = [];
    const manualOverrides: boolean[] = [];

    for (let monthIndex = 0; monthIndex <= endMonthIndex; monthIndex += 1) {
      const monthKey = formatMonth(year, monthIndex);
      const manualValue = manualWarrantyData[monthKey];
      const hasManual =
        typeof manualValue === 'number' && Number.isFinite(manualValue);
      values.push(
        hasManual
          ? manualValue
          : getMonthlyCount(monthlyWarrantyCounts, year, monthIndex),
      );
      manualOverrides.push(hasManual);
    }

    return {
      manualOverrides,
      values,
      year,
    };
  });
}

function getMonthlyCount(
  monthlyCounts: Map<string, number>,
  year: number,
  monthIndex: number,
) {
  return monthlyCounts.get(formatMonth(year, monthIndex)) || 0;
}

async function buildYearIntensity(
  yearSeries: YearSeriesItem[],
  endMonthIndex: number,
  yearWarrantySeries: YearWarrantySeriesItem[],
): Promise<YearIntensityItem[]> {
  const warrantySeriesByYear = new Map(
    yearWarrantySeries.map((series) => [series.year, series.values]),
  );

  return yearSeries.map((series) => {
    const issueCount = series.values
      .slice(0, endMonthIndex + 1)
      .reduce((total, value) => total + Number(value || 0), 0);
    const warrantyValues = (warrantySeriesByYear.get(series.year) || []).slice(
      0,
      endMonthIndex + 1,
    );
    const months = warrantyValues.length;
    const averageWarrantyVehicleCount =
      months > 0
        ? warrantyValues.reduce(
            (total, value) => total + Number(value || 0),
            0,
          ) / months
        : 0;
    const perVehicle =
      averageWarrantyVehicleCount > 0
        ? issueCount / averageWarrantyVehicleCount
        : 0;

    return {
      intensityPct: Number((perVehicle * 100).toFixed(1)),
      issueCount,
      perVehicle: Number(perVehicle.toFixed(3)),
      warrantyVehicleCount: Number(averageWarrantyVehicleCount.toFixed(3)),
      year: series.year,
    };
  });
}

function calculateWarrantyVehicleCountAtPoint(
  workOrders: WorkOrderWarrantySeed[],
  point: Date,
) {
  let total = 0;

  for (const item of workOrders) {
    if (!(item.deliveryDate instanceof Date)) {
      continue;
    }
    const warrantyEnd = addYearsToDate(item.deliveryDate, 1);
    if (
      item.deliveryDate.getTime() <= point.getTime() &&
      warrantyEnd.getTime() > point.getTime()
    ) {
      total += Number(item.quantity || 0);
    }
  }

  return total;
}

async function getDisplayYears(
  selectedYear: number,
  endMonth: Date,
  manualData: Record<string, number>,
  vehicleDeptIds: string[],
) {
  const earliestAutoRecord = await prisma.after_sales.findFirst({
    orderBy: { occurDate: 'asc' },
    select: { occurDate: true },
    where: {
      isDeleted: false,
      occurDate: { lte: endMonth },
      OR: [
        {
          productType: VEHICLE_PRODUCT_TYPE,
        },
        {
          work_orders: {
            ...buildVehicleDivisionWhere(vehicleDeptIds),
            isDeleted: false,
          },
        },
      ],
    },
  });

  const manualYears = Object.keys(manualData)
    .map((month) => Number(month.slice(0, 4)))
    .filter((year) => Number.isInteger(year) && year <= selectedYear);

  const manualStartYear =
    manualYears.length > 0 ? Math.min(...manualYears) : undefined;
  const autoStartYear = earliestAutoRecord?.occurDate?.getFullYear();
  const startYearCandidates = [autoStartYear, manualStartYear, selectedYear]
    .filter((year): year is number => typeof year === 'number')
    .map((year) => Math.min(year, selectedYear));
  const startYear = Math.min(...startYearCandidates);

  return Array.from(
    { length: selectedYear - startYear + 1 },
    (_, index) => startYear + index,
  );
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

function getMonthIndex(period: string) {
  const [yearValue, monthValue] = period.split('-');
  if (
    !yearValue ||
    !monthValue ||
    !/^\d{4}$/.test(yearValue) ||
    !/^\d{2}$/.test(monthValue)
  ) {
    return 0;
  }
  const monthIndex = Number(monthValue) - 1;
  return monthIndex >= 0 && monthIndex <= 11 ? monthIndex : 0;
}

function formatMonth(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function buildVehicleDivisionWhere(vehicleDeptIds: string[]) {
  const divisions = vehicleDeptIds.filter(Boolean);
  if (divisions.length > 0) {
    return {
      OR: [
        {
          division: { in: divisions },
        },
        {
          AND: [
            { division: { contains: '车辆' as const } },
            { division: { contains: 'SOBU' as const } },
          ],
        },
      ],
    };
  }
  return {
    AND: [
      { division: { contains: '车辆' as const } },
      { division: { contains: 'SOBU' as const } },
    ],
  };
}

function isVehicleDivision(
  value: null | string | undefined,
  vehicleDeptIds: string[],
) {
  if (!value) {
    return false;
  }
  if (vehicleDeptIds.includes(value)) {
    return true;
  }
  const normalized = value.replaceAll(/\s+/gu, '').toUpperCase();
  return normalized.includes('车辆') && normalized.includes('SOBU');
}

async function getVehicleDeptIds() {
  const rows = await prisma.departments.findMany({
    select: { id: true },
    where: {
      isDeleted: false,
      name: {
        contains: '车辆',
      },
      AND: [
        {
          name: {
            contains: 'SOBU',
          },
        },
      ],
    },
  });
  return rows.map((item) => item.id).filter(Boolean);
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
