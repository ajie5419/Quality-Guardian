import { defineEventHandler, getQuery } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

// Inlined constants to avoid module resolution issues during hot reload
const PROCESS_DEFECT_TARGETS: Record<string, number> = {
  原材料: 0.2,
  辅材: 0.1,
  外购件: 0.2,
  机加件: 0.1,
  下料: 0.1,
  组对: 0.15,
  焊接: 0.15,
  机加: 0.1,
  涂装: 0.15,
  组装: 0.15,
  装配: 0.15,
  外协: 0.15,
};
const DEFAULT_DEFECT_TARGET = 0.15;

const getTargetPassRate = (processName?: string): number => {
  if (!processName) {
    return Number((100 - DEFAULT_DEFECT_TARGET).toFixed(2));
  }
  const defectRate =
    PROCESS_DEFECT_TARGETS[processName] ?? DEFAULT_DEFECT_TARGET;
  return Number((100 - defectRate).toFixed(2));
};

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const query = getQuery(event);
  const granularity = (query.granularity as unknown as string) || 'week';
  const period = query.period as unknown as string;

  try {
    if (period)
      return useResponseSuccess(await getDrillDownData(period, granularity));
    return useResponseSuccess(await getTrendData(granularity));
  } catch (error) {
    // logApiError('pass-rate-trend', error);
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

async function getDrillDownData(period: string, granularity: string) {
  const range = getPeriodRangeFromTrend(period, granularity);
  if (!range) return { drillDown: [], period };
  const { start, end } = range;

  interface DrillDownItem {
    category: string;
    passCount: number;
    passRate: number;
    process: string;
    targetPassRate: number;
    totalCount: number;
  }
  const drillDown: DrillDownItem[] = [];
  const inspections = await prisma.inspections.findMany({
    where: { isDeleted: false, inspectionDate: { gte: start, lte: end } },
  });

  // Fetch NCR (Quality Records) for the same period
  const ncrRecords = await prisma.quality_records.findMany({
    where: { isDeleted: false, date: { gte: start, lte: end } },
    select: { processName: true, quantity: true },
  });

  // 工序映射字典
  const PROCESS_MAPPING: Record<string, string> = {
    // 设计
    设计: '设计',

    // 组焊 = 组对 + 焊接
    组对: '组焊',
    焊接: '组焊',
    焊后尺寸: '组焊',

    // 组装 = 组装 + 装配 + 组拼
    组装: '组装',
    装配: '组装',
    组拼: '组装',

    // 涂装 = 打砂 + 喷漆
    打砂: '涂装',
    喷漆: '涂装',

    // 单独统计
    下料: '下料',
    机加: '机加',

    // 不统计
    外观: '',
    整体拼装: '',
  };

  // Map NCR quantity by process (Apply MAPPING)
  const ncrDefectsMap: Record<string, number> = {};
  ncrRecords.forEach((rec) => {
    const rawProc = rec.processName || '其他';
    // Try to map it first, if no mapping exists, use raw name (for incoming etc)
    const proc = PROCESS_MAPPING[rawProc] || rawProc;
    ncrDefectsMap[proc] = (ncrDefectsMap[proc] || 0) + (rec.quantity || 0);
  });

  // 来料检验
  const incomingTypes = [
    ...new Set(
      inspections
        .filter((i) => i.category === 'INCOMING')
        .map((i) => (i.incomingType || '未分类') as string),
    ),
  ];
  for (const type of incomingTypes) {
    const items = inspections.filter(
      (i) => i.category === 'INCOMING' && (i.incomingType || '未分类') === type,
    );
    // Use quantity instead of length
    const total = items.reduce((sum, i) => sum + (i.quantity || 1), 0);
    let passed = items
      .filter((i) => i.result === 'PASS')
      .reduce((sum, i) => sum + (i.quantity || 1), 0);

    // Apply NCR deduction
    const ncrQty = ncrDefectsMap[String(type)] || 0;
    passed = Math.max(0, passed - ncrQty);

    drillDown.push({
      process: String(type),
      category: '来料检验',
      passRate: total > 0 ? Number(((passed / total) * 100).toFixed(1)) : 0,
      targetPassRate: getTargetPassRate(String(type)),
      totalCount: total,
      passCount: passed,
    });
  }

  // 过程检验逻辑重构
  const processItems = inspections.filter((i) => i.category === 'PROCESS');

  // 聚合数据
  const processStats: Record<string, { passed: number; total: number }> = {};

  // Initialize with Design to ensure it shows up even if no inspections
  const designName = PROCESS_MAPPING['设计'] || '设计';
  if (ncrDefectsMap[designName]) {
    processStats[designName] = { total: 0, passed: 0 };
  }

  for (const item of processItems) {
    const rawProcess = item.processName || '';
    const mappedName = PROCESS_MAPPING[rawProcess];

    if (!mappedName) continue;

    if (!processStats[mappedName]) {
      processStats[mappedName] = { total: 0, passed: 0 };
    }

    // Use quantity instead of count
    const qty = item.quantity || 1;
    processStats[mappedName].total += qty;
    if (item.result === 'PASS') {
      processStats[mappedName].passed += qty;
    }
  }

  // 生成 DrillDown Item
  for (const [name, stats] of Object.entries(processStats)) {
    const { total, passed: rawPassed } = stats;

    // Apply NCR deduction
    const ncrQty = ncrDefectsMap[name] || 0;
    const passed = Math.max(0, rawPassed - ncrQty);

    // Use NCR as total if no inspections (e.g. Design)
    const effectiveTotal = Math.max(total, ncrQty);

    drillDown.push({
      process: name,
      category: '过程检验',
      passRate:
        effectiveTotal > 0
          ? Number(((passed / effectiveTotal) * 100).toFixed(1))
          : 0,
      targetPassRate: getTargetPassRate(name),
      totalCount: effectiveTotal,
      passCount: passed,
    });
  }

  // 成成品检验 (发货检验)
  const finals = inspections.filter((i) => i.category === 'SHIPMENT');
  if (finals.length > 0 || ncrDefectsMap['成品检验']) {
    const total = finals.reduce((sum, i) => sum + (i.quantity || 1), 0);
    let passed = finals
      .filter((i) => i.result === 'PASS')
      .reduce((sum, i) => sum + (i.quantity || 1), 0);

    const ncrQty = ncrDefectsMap['成品检验'] || 0;
    passed = Math.max(0, passed - ncrQty);

    const effectiveTotal = Math.max(total, ncrQty);

    drillDown.push({
      process: '成品检验',
      category: '成品检验',
      passRate:
        effectiveTotal > 0
          ? Number(((passed / effectiveTotal) * 100).toFixed(1))
          : 0,
      targetPassRate: getTargetPassRate('成品检验'),
      totalCount: effectiveTotal,
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
