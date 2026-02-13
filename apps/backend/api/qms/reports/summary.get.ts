import { defineEventHandler, getQuery, setResponseStatus } from 'h3';
import { getTargetPassRate } from '~/constants/quality-standards';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { parseReportPeriodType, resolveReportQueryDate } from '~/utils/report';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const query = getQuery(event);
  const type = parseReportPeriodType(query.type);
  if (!type) {
    setResponseStatus(event, 400);
    return useResponseError('Invalid type parameter');
  }
  const { date: targetDate, valid: isDateValid } = resolveReportQueryDate(
    query.date,
  );
  if (!isDateValid) {
    setResponseStatus(event, 400);
    return useResponseError('Invalid date parameter');
  }

  try {
    const historyCount = 6;
    const periods = Array.from({ length: historyCount })
      .map(
        (_, i) =>
          getReportPeriods(shiftDate(targetDate, type, -i), type).current,
      )
      .reverse();

    const currentPeriod = periods[historyCount - 1];
    const _previousPeriod = periods[historyCount - 2];

    // Parallel data fetching for the entire history and current details
    const [
      historyMetrics,
      defects,
      topRiskProjects,
      supplierRanking,
      majorEvents,
      processPassRates,
    ] = await Promise.all([
      Promise.all(periods.map((p) => fetchPeriodMetrics(p.start, p.end))),
      fetchDefectDistribution(currentPeriod.start, currentPeriod.end),
      fetchTopRiskProjects(currentPeriod.start, currentPeriod.end),
      fetchSupplierPerformance(currentPeriod.start, currentPeriod.end),
      fetchMajorEvents(currentPeriod.start, currentPeriod.end),
      fetchProcessPassRates(currentPeriod.start, currentPeriod.end),
    ]);

    const currData = historyMetrics[historyCount - 1];
    const prevData = historyMetrics[historyCount - 2];

    const reportData = {
      title: `${type === 'weekly' ? '周' : '月'}度质量分析报告`,
      period: `${formatDate(currentPeriod.start)} ~ ${formatDate(currentPeriod.end)}`,
      metrics: [
        {
          label: '综合合格率',
          value: currData.passRate,
          unit: '%',
          trend: calculateTrend(currData.passRate, prevData.passRate),
          desc: '检验合格总数 /检验总数',
          history: historyMetrics.map((h) => h.passRate),
        },
        {
          label: '制造损失',
          value: currData.internalLoss,
          unit: '¥',
          trend: calculateTrend(
            currData.internalLoss,
            prevData.internalLoss,
            true,
          ),
          desc: 'NCR 产生的报废与工时损失',
          history: historyMetrics.map((h) => h.internalLoss),
        },
        {
          label: '售后损失',
          value: currData.externalLoss,
          unit: '¥',
          trend: calculateTrend(
            currData.externalLoss,
            prevData.externalLoss,
            true,
          ),
          desc: '售后赔偿及维修成本',
          history: historyMetrics.map((h) => h.externalLoss),
        },
        {
          label: '问题结案率',
          value: currData.closingRate,
          unit: '%',
          trend: calculateTrend(currData.closingRate, prevData.closingRate),
          desc: '本期已关闭问题 / 本期新增问题',
          history: historyMetrics.map((h) => h.closingRate),
        },
      ],
      historyLabels: periods.map((p) => formatDateShort(p.start, type)),
      defects: defects.map((d) => ({
        name: d.defectType || '未分类',
        value: d._count,
      })),
      processPassRates,
      topProjects: topRiskProjects.map((p) => ({
        name: p.projectName || '未知项目',
        issues: p._count,
        loss: Number(p._sum.lossAmount || 0),
      })),
      suppliers: {
        best: supplierRanking.slice(0, 3),
        worst: supplierRanking.reverse().slice(0, 3),
      },
      majorEvents: majorEvents.map((e) => ({
        id: e.id,
        title: e.partName || '未知部件',
        project: e.projectName,
        loss: Number(e.lossAmount),
        status: e.status,
        date: formatDate(e.date),
        desc: e.description,
      })),
    };

    return useResponseSuccess(reportData);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    logApiError('summary', error);
    setResponseStatus(event, 500);
    return useResponseError(`报告生成失败: ${errorMessage}`);
  }
});

async function fetchPeriodMetrics(start: Date, end: Date) {
  const [
    passedInspections,
    totalInspections,
    newIssues,
    closedIssues,
    internalLossAgg,
    externalLossAgg,
    manualLossAgg,
  ] = await Promise.all([
    prisma.inspections.count({
      where: {
        inspectionDate: { gte: start, lte: end },
        result: 'PASS',
        isDeleted: false,
      },
    }),
    prisma.inspections.count({
      where: { inspectionDate: { gte: start, lte: end }, isDeleted: false },
    }),
    prisma.quality_records.count({
      where: { createdAt: { gte: start, lte: end }, isDeleted: false },
    }),
    prisma.quality_records.count({
      where: {
        createdAt: { gte: start, lte: end },
        status: 'CLOSED',
        isDeleted: false,
      },
    }),
    prisma.quality_records.aggregate({
      _sum: { lossAmount: true },
      where: { date: { gte: start, lte: end }, isDeleted: false },
    }),
    prisma.after_sales.aggregate({
      _sum: { materialCost: true, laborTravelCost: true },
      where: { occurDate: { gte: start, lte: end }, isDeleted: false },
    }),
    prisma.quality_losses.aggregate({
      _sum: { amount: true },
      where: { occurDate: { gte: start, lte: end }, isDeleted: false },
    }),
  ]);

  const passRate =
    totalInspections > 0
      ? ((passedInspections / totalInspections) * 100).toFixed(1)
      : 0;
  const closingRate =
    newIssues > 0 ? ((closedIssues / newIssues) * 100).toFixed(1) : 100;
  const internalLoss =
    Number(internalLossAgg._sum.lossAmount || 0) +
    Number(manualLossAgg._sum.amount || 0);
  const externalLoss =
    Number(externalLossAgg._sum.materialCost || 0) +
    Number(externalLossAgg._sum.laborTravelCost || 0);

  return {
    passRate: Number(passRate),
    closingRate: Number(closingRate),
    internalLoss,
    externalLoss,
  };
}

async function fetchProcessPassRates(start: Date, end: Date) {
  interface ProcessPassRateRow {
    processName: null | string;
    category: null | string;
    total: bigint | number;
    passed: bigint | number;
  }
  const rows = (await prisma.$queryRaw`
      SELECT 
        processName,
        category,
        COUNT(*) as total,
        SUM(CASE WHEN result = 'PASS' THEN 1 ELSE 0 END) as passed
      FROM inspections
      WHERE inspectionDate >= ${start} AND inspectionDate <= ${end} AND isDeleted = 0
      GROUP BY processName, category
  `) as ProcessPassRateRow[];

  return rows.map((row) => {
    const total = Number(row.total);
    const passed = Number(row.passed);
    const passRate = total > 0 ? ((passed / total) * 100).toFixed(2) : '0.00';
    const targetPassRate = getTargetPassRate(row.processName);

    return {
      processName: row.processName || '未知工序',
      category: row.category || '其他',
      total,
      passed,
      passRate: Number(passRate),
      targetPassRate, // 新增：目标合格率
    };
  });
}

async function fetchDefectDistribution(start: Date, end: Date) {
  return prisma.quality_records.groupBy({
    by: ['defectType'],
    where: { date: { gte: start, lte: end }, isDeleted: false },
    _count: true,
    orderBy: { _count: { defectType: 'desc' } },
    take: 5,
  });
}

async function fetchTopRiskProjects(start: Date, end: Date) {
  return prisma.quality_records.groupBy({
    by: ['projectName'],
    where: { date: { gte: start, lte: end }, isDeleted: false },
    _count: true,
    _sum: { lossAmount: true },
    orderBy: { _sum: { lossAmount: 'desc' } },
    take: 5,
  });
}

async function fetchSupplierPerformance(start: Date, end: Date) {
  // 简化逻辑：通过 NCR 数量反向评估
  const stats = await prisma.quality_records.groupBy({
    by: ['supplierName'],
    where: {
      date: { gte: start, lte: end },
      isDeleted: false,
      supplierName: { not: null },
    },
    _count: true,
  });
  return stats
    .map((s) => ({ name: s.supplierName, issues: s._count }))
    .sort((a, b) => a.issues - b.issues); // 问题越少排名越前
}

async function fetchMajorEvents(start: Date, end: Date) {
  return prisma.quality_records.findMany({
    where: { date: { gte: start, lte: end }, isDeleted: false },
    orderBy: { lossAmount: 'desc' },
    take: 3,
  });
}

function getReportPeriods(date: Date, type: string) {
  const currentStart = new Date(date);
  const currentEnd = new Date(date);
  if (type === 'weekly') {
    const day = currentStart.getDay() || 7;
    currentStart.setDate(currentStart.getDate() - day + 1);
    currentStart.setHours(0, 0, 0, 0);
    currentEnd.setDate(currentStart.getDate() + 6);
    currentEnd.setHours(23, 59, 59, 999);
  } else {
    currentStart.setDate(1);
    currentStart.setHours(0, 0, 0, 0);
    currentEnd.setMonth(currentStart.getMonth() + 1, 0);
    currentEnd.setHours(23, 59, 59, 999);
  }
  return { current: { start: currentStart, end: currentEnd } };
}

function shiftDate(date: Date, type: string, amount: number) {
  const d = new Date(date);
  if (type === 'weekly') d.setDate(d.getDate() + amount * 7);
  else d.setMonth(d.getMonth() + amount);
  return d;
}

function calculateTrend(curr: number, prev: number, lowerIsBetter = false) {
  if (!prev) return 0;
  const diff = (((curr - prev) / prev) * 100).toFixed(1);
  const val = Number(diff);
  return lowerIsBetter ? -val : val;
}

function formatDate(date: Date) {
  return date.toISOString().split('T')[0];
}

function formatDateShort(date: Date, type: string) {
  if (type === 'weekly') {
    const d = new Date(date);
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(
      ((d.getTime() - startOfYear.getTime()) / 86_400_000 +
        startOfYear.getDay() +
        1) /
        7,
    );
    return `W${week}`;
  }
  return `${date.getMonth() + 1}月`;
}
