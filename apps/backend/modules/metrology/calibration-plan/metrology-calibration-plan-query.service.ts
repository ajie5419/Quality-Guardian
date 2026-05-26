import type {
  CalibrationPlanListParams,
  CalibrationPlanOverviewParams,
} from './metrology-calibration-plan-mapping';

import prisma from '~/utils/prisma';

import {
  buildCalibrationPlanOrderBy,
  buildListItem,
  buildOverviewWhere,
  buildWhere,
  compareValues,
  startOfToday,
} from './metrology-calibration-plan-mapping';

export const MetrologyCalibrationPlanQueryService = {
  async getList(params: CalibrationPlanListParams) {
    const page = Math.max(Number(params.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize || 20), 1), 100);
    const where = buildWhere(params);
    const skip = (page - 1) * pageSize;

    const [rows, total] = await Promise.all([
      prisma.metrology_calibration_plans.findMany({
        where,
        include: {
          instrument: {
            select: {
              id: true,
              instrumentCode: true,
              instrumentName: true,
              model: true,
              orderNo: true,
              usingUnit: true,
            },
          },
        },
        orderBy: buildCalibrationPlanOrderBy(params.sortBy, params.sortOrder),
        skip,
        take: pageSize,
      }),
      prisma.metrology_calibration_plans.count({ where }),
    ]);

    return { items: rows.map((item) => buildListItem(item)), total };
  },

  async getAnnualGrid(
    params: Omit<CalibrationPlanListParams, 'page' | 'pageSize'>,
  ) {
    const where = buildWhere(params);
    const rows = await prisma.metrology_calibration_plans.findMany({
      where,
      include: {
        instrument: {
          select: {
            id: true,
            instrumentCode: true,
            instrumentName: true,
            model: true,
            orderNo: true,
            usingUnit: true,
          },
        },
      },
      orderBy: [{ planMonth: 'asc' }, { planDay: 'asc' }],
    });

    const grouped = new Map<
      string,
      {
        instrumentCode: string;
        instrumentId: string;
        instrumentName: string;
        model: null | string;
        months: Record<string, Record<string, unknown>>;
        orderNo: null | number;
        usingUnit: null | string;
      }
    >();

    for (const row of rows) {
      const item = buildListItem(row);
      const key = row.instrument.id;
      const current = grouped.get(key) ?? {
        instrumentCode: row.instrument.instrumentCode,
        instrumentId: row.instrument.id,
        instrumentName: row.instrument.instrumentName,
        model: row.instrument.model,
        months: Object.fromEntries(
          Array.from({ length: 12 }, (_, index) => [
            String(index + 1),
            {
              actualDate: null,
              id: null,
              planDay: null,
              plannedDate: null,
              status: undefined,
              statusLabel: null,
            },
          ]),
        ),
        orderNo: row.instrument.orderNo,
        usingUnit: row.instrument.usingUnit,
      };

      current.months[String(row.planMonth)] = {
        actualDate: item.actualDate,
        id: item.id,
        planDay: item.planDay,
        plannedDate: item.plannedDate,
        status: item.status,
        statusLabel: item.statusLabel,
      };
      grouped.set(key, current);
    }

    return [...grouped.values()].sort((left, right) =>
      compareValues(left.orderNo, right.orderNo, 'asc'),
    );
  },

  async getOverview(params: CalibrationPlanOverviewParams) {
    const where = buildOverviewWhere(params);
    const rows = await prisma.metrology_calibration_plans.findMany({
      where,
      include: {
        instrument: {
          select: {
            id: true,
            instrumentCode: true,
            instrumentName: true,
            model: true,
            orderNo: true,
            usingUnit: true,
          },
        },
      },
      orderBy: [{ plannedDate: 'asc' }],
    });

    const items = rows.map((item) => buildListItem(item));
    const selectedYear = params.year || new Date().getFullYear();
    const selectedMonth =
      params.month && params.month >= 1 && params.month <= 12
        ? params.month
        : new Date().getMonth() + 1;
    const today = startOfToday().getTime();
    const upcomingEnd = today + 7 * 24 * 60 * 60 * 1000;

    const summary = {
      completedCount: 0,
      currentMonthCount: 0,
      overdueCount: 0,
      totalCount: items.length,
      upcomingCount: 0,
    };
    const monthlyDistribution = Array.from({ length: 12 }, (_, index) => ({
      completed: 0,
      month: index + 1,
      overdue: 0,
      planned: 0,
      total: 0,
    }));

    for (const item of items) {
      const distribution = monthlyDistribution[item.planMonth - 1];
      if (distribution) {
        distribution.total += 1;
        if (item.status === 'COMPLETED') {
          distribution.completed += 1;
        } else if (item.status === 'OVERDUE') {
          distribution.overdue += 1;
        } else {
          distribution.planned += 1;
        }
      }

      if (item.status === 'COMPLETED') {
        summary.completedCount += 1;
      } else if (item.status === 'OVERDUE') {
        summary.overdueCount += 1;
      }

      if (item.planYear === selectedYear && item.planMonth === selectedMonth) {
        summary.currentMonthCount += 1;
      }

      const plannedDate = item.plannedDate
        ? new Date(`${item.plannedDate}T00:00:00`).getTime()
        : null;
      if (
        plannedDate !== null &&
        item.status !== 'COMPLETED' &&
        plannedDate >= today &&
        plannedDate <= upcomingEnd
      ) {
        summary.upcomingCount += 1;
      }
    }

    const upcomingItems = items
      .filter((item) => {
        if (!item.plannedDate || item.status === 'COMPLETED') {
          return false;
        }
        const plannedDate = new Date(`${item.plannedDate}T00:00:00`).getTime();
        return plannedDate >= today && plannedDate <= upcomingEnd;
      })
      .slice(0, 10);

    return {
      monthlyDistribution,
      summary,
      upcomingItems,
    };
  },
};
