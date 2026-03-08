import { defineEventHandler, getQuery } from 'h3';
import { logApiError } from '~/utils/api-logger';
import prisma from '~/utils/prisma';
import { useResponseSuccess } from '~/utils/response';

interface FaultRateWindow {
  end: Date;
  label: string;
  start: Date;
}

interface FaultSummary {
  failedVehicles: number;
  rate: number;
  totalVehicles: number;
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const modelFilter = normalizeModelFilter(query.model);
  const endMonth = parseEndMonth(query.month);

  try {
    const windows = getYearToDateWindows(endMonth);

    const trend = await Promise.all(
      windows.map(async (window) => {
        const summary = await buildFaultSummary(window, modelFilter);

        return {
          failedVehicles: summary.failedVehicles,
          period: window.label,
          rate: summary.rate,
          totalVehicles: summary.totalVehicles,
        };
      }),
    );

    const rankingWindow = {
      end: windows.at(-1)?.end ?? new Date(),
      label: 'ranking',
      start: windows[0]?.start ?? new Date(),
    };

    const ranking = await buildRanking(rankingWindow);

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

async function buildFaultSummary(
  window: FaultRateWindow,
  modelFilter: null | string,
): Promise<FaultSummary> {
  const shippedVehicles = await prisma.work_orders.findMany({
    select: {
      workOrderNumber: true,
    },
    where: {
      deliveryDate: { gte: window.start, lte: window.end },
      isDeleted: false,
      projectName: buildVehicleProjectNameFilter(modelFilter),
      status: 'COMPLETED',
    },
  });

  const shippedVehicleIds = [
    ...new Set(shippedVehicles.map((item) => item.workOrderNumber)),
  ];
  if (shippedVehicleIds.length === 0) {
    return {
      failedVehicles: 0,
      rate: 0,
      totalVehicles: 0,
    };
  }

  const failedVehicles = await prisma.after_sales.groupBy({
    by: ['workOrderNumber'],
    where: {
      isDeleted: false,
      occurDate: { lte: window.end },
      projectName: buildVehicleProjectNameFilter(modelFilter),
      workOrderNumber: {
        in: shippedVehicleIds,
      },
    },
  });

  const totalVehicles = shippedVehicleIds.length;
  const failedVehicleCount = failedVehicles.length;
  const rate =
    totalVehicles > 0
      ? Number(((failedVehicleCount / totalVehicles) * 100).toFixed(2))
      : 0;

  return {
    failedVehicles: failedVehicleCount,
    rate,
    totalVehicles,
  };
}

async function buildRanking(window: FaultRateWindow) {
  const shippedVehicles = await prisma.work_orders.findMany({
    select: {
      projectName: true,
      workOrderNumber: true,
    },
    where: {
      deliveryDate: { gte: window.start, lte: window.end },
      isDeleted: false,
      projectName: buildVehicleProjectNameFilter(),
      status: 'COMPLETED',
    },
  });

  const modelToVehicles = new Map<string, Set<string>>();
  for (const item of shippedVehicles) {
    const model = normalizeModelName(item.projectName);
    if (!model) {
      continue;
    }

    if (!modelToVehicles.has(model)) {
      modelToVehicles.set(model, new Set());
    }
    modelToVehicles.get(model)?.add(item.workOrderNumber);
  }

  const allVehicleIds = [
    ...new Set(shippedVehicles.map((item) => item.workOrderNumber)),
  ];
  const faultGroups =
    allVehicleIds.length > 0
      ? await prisma.after_sales.groupBy({
          by: ['projectName', 'workOrderNumber'],
          where: {
            isDeleted: false,
            occurDate: { lte: window.end },
            projectName: buildVehicleProjectNameFilter(),
            workOrderNumber: {
              in: allVehicleIds,
            },
          },
        })
      : [];

  const failedVehiclesByModel = new Map<string, Set<string>>();
  for (const group of faultGroups) {
    const model = normalizeModelName(group.projectName);
    if (!model) {
      continue;
    }
    if (!failedVehiclesByModel.has(model)) {
      failedVehiclesByModel.set(model, new Set());
    }
    failedVehiclesByModel.get(model)?.add(group.workOrderNumber);
  }

  return [...modelToVehicles.entries()]
    .map(([model, vehicles]) => {
      const totalVehicles = vehicles.size;
      const failedVehicles = failedVehiclesByModel.get(model)?.size || 0;
      const rate =
        totalVehicles > 0
          ? Number(((failedVehicles / totalVehicles) * 100).toFixed(2))
          : 0;

      return {
        failedVehicles,
        model,
        rate,
        totalVehicles,
      };
    })
    .filter((item) => {
      return Boolean(item.model) && item.totalVehicles > 0;
    })
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 10);
}

function getYearToDateWindows(endMonth: Date): FaultRateWindow[] {
  const windows: FaultRateWindow[] = [];
  const endMonthIndex = endMonth.getMonth();

  for (let monthIndex = 0; monthIndex <= endMonthIndex; monthIndex += 1) {
    const start = new Date(endMonth.getFullYear(), 0, 1);
    const end = new Date(
      endMonth.getFullYear(),
      monthIndex + 1,
      0,
      23,
      59,
      59,
      999,
    );

    windows.push({
      end,
      label: `${endMonth.getFullYear()}-${String(monthIndex + 1).padStart(2, '0')}`,
      start,
    });
  }

  return windows;
}

function normalizeModelFilter(value: unknown): null | string {
  const normalized = normalizeModelName(value);
  return normalized || null;
}

function normalizeModelName(value: unknown): null | string {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function buildVehicleProjectNameFilter(modelFilter?: null | string) {
  if (modelFilter) {
    if (!modelFilter.includes('车')) {
      return {
        equals: '__QMS_VEHICLE_PROJECT_FILTER_NONE__',
      };
    }

    return {
      equals: modelFilter,
    };
  }

  return {
    contains: '车',
  };
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
