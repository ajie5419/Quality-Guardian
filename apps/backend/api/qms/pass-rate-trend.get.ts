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
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const query = getQuery(event);
  const granularity = (query.granularity as unknown as string) || 'week';
  const period = query.period as unknown as string;

  try {
    if (period)
      return useResponseSuccess(await getDrillDownData(period, granularity));
    return useResponseSuccess(await getTrendData(granularity));
  } catch (error) {
    // console.error('Failed to fetch pass rate trend:', error);
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

  // Optimization: Fetch ALL inspections for the year in ONE query
  const allInspections = await prisma.inspections.findMany({
    where: {
      isDeleted: false,
      inspectionDate: { gte: yearStart, lte: now },
      category: { not: 'SHIPMENT' }, // Adjusted to match schema enum (INCOMING, PROCESS, SHIPMENT)
    },
    select: { inspectionDate: true, result: true },
  });

  const trend = periods.map((p) => {
    const periodInspections = allInspections.filter((ins) => {
      const d = new Date(ins.inspectionDate);
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
    targetPassRate: number;
    totalCount: number;
  }
  const drillDown: DrillDownItem[] = [];
  const inspections = await prisma.inspections.findMany({
    where: { isDeleted: false, inspectionDate: { gte: start, lte: end } },
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
    const total = items.length;
    const passed = items.filter((i) => i.result === 'PASS').length;
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

  // 工序映射字典
  const PROCESS_MAPPING: Record<string, string> = {
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

  // 聚合数据
  const processStats: Record<string, { passed: number; total: number }> = {};

  for (const item of processItems) {
    const rawProcess = item.processName || '';
    // 如果没有映射规则，且不在排除列表，则保留原名？
    // 需求：外购件、原材料、辅材、机加成品件（这些是INCOMING，上面已处理）
    // 需求：下料、组焊、机加、组装、涂装

    const mappedName = PROCESS_MAPPING[rawProcess];

    // 如果不在映射表中，且不是我们明确要的工序，是否需要统计？
    // 根据需求描述：“至此，需要统计和显示合格率的工序为...”
    // 意味着只统计这些。

    if (!mappedName) continue; // 跳过不统计的工序

    if (!processStats[mappedName]) {
      processStats[mappedName] = { total: 0, passed: 0 };
    }

    processStats[mappedName].total += 1;
    if (item.result === 'PASS') {
      processStats[mappedName].passed += 1;
    }
  }

  // 生成 DrillDown Item
  for (const [name, stats] of Object.entries(processStats)) {
    const { total, passed } = stats;
    drillDown.push({
      process: name,
      category: '过程检验',
      passRate: total > 0 ? Number(((passed / total) * 100).toFixed(1)) : 0,
      targetPassRate: getTargetPassRate(name),
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
      targetPassRate: getTargetPassRate('成品检验'),
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
