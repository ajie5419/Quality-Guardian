import {
  createIdentityAggregateItem,
  parseReportPeriodType,
  QMS_DEFAULT_VALUES,
  resolveReportPeriodRange,
  resolveReportShortLabel,
  shiftReportAnchorDate,
} from '@qgs/shared';
import { AfterSalesAPI } from '~/modules/after-sales';
import { InspectionService } from '~/modules/inspection';
import { QualityLossService } from '~/modules/quality-loss';
import {
  createPassRateTargetResolver,
  getNetPassRateSummaryByRange,
  getPassRateDrillDownByRange,
} from '~/modules/report/pass-rate';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';

import { ReportDailySummaryService } from './report-daily-summary.service';
import { ReportQueryValidationError } from './report-query-validation-error';
import { formatReportDate, resolveReportQueryDate } from './report-utils';

export const ReportSummaryService = {
  isValidationError(error: unknown): error is ReportQueryValidationError {
    return error instanceof ReportQueryValidationError;
  },
  async getSummary(type: 'monthly' | 'weekly', targetDate: Date) {
    const historyCount = 6;
    const periods = Array.from({ length: historyCount })
      .map(
        (_, i) =>
          getReportPeriods(shiftDate(targetDate, type, -i), type).current,
      )
      .reverse();
    const currentPeriod = periods[historyCount - 1];
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

    return {
      title: `${type === 'weekly' ? '周' : '月'}度质量分析报告`,
      period: `${formatReportDate(currentPeriod.start)} ~ ${formatReportDate(currentPeriod.end)}`,
      metrics: [
        {
          label: '综合合格率',
          value: currData.passRate,
          unit: '%',
          trend: calculateTrend(currData.passRate, prevData.passRate),
          desc: '检验合格数量扣减不合格项后的净合格率',
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
          desc: '售后总成本扣减已追偿',
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
      defects,
      processPassRates,
      topProjects: topRiskProjects.map((p) => ({
        name: p.projectName || '未知项目',
        issues: p._count,
        loss: Number(p._sum.lossAmount || 0),
      })),
      suppliers: {
        best: supplierRanking.slice(0, 3),
        worst: [...supplierRanking].reverse().slice(0, 3),
      },
      majorEvents: majorEvents.map((e) => ({
        id: e.id,
        title: e.partName || '未知部件',
        project: e.projectName,
        loss: Number(e.lossAmount),
        status: e.status,
        date: formatReportDate(e.date),
        desc: e.description,
      })),
    };
  },
  async getSummaryFromQuery(rawType?: string, rawDate?: string) {
    const type = parseReportPeriodType(rawType);
    if (!type) {
      throw new ReportQueryValidationError('Invalid type parameter');
    }
    const { date: targetDate, valid: isDateValid } =
      resolveReportQueryDate(rawDate);
    if (!isDateValid) {
      throw new ReportQueryValidationError('Invalid date parameter');
    }
    return this.getSummary(type, targetDate);
  },
  async getDailySummaryFromQuery(input: {
    date?: string;
    realName?: string;
    user?: string;
    username: string;
  }) {
    return ReportDailySummaryService.getDailySummaryFromQuery(input);
  },
};

async function fetchPeriodMetrics(start: Date, end: Date) {
  const [
    passRateSummary,
    inspectionMetrics,
    afterSalesMetrics,
    qualityLossMetrics,
  ] = await Promise.all([
    getNetPassRateSummaryByRange(start, end),
    InspectionService.getReportPeriodMetrics({ start, end }),
    AfterSalesAPI.getReportPeriodMetrics({ start, end }),
    QualityLossService.getReportPeriodMetrics({ start, end }),
  ]);
  const closingRate =
    inspectionMetrics.newIssues > 0
      ? (
          (inspectionMetrics.closedIssues / inspectionMetrics.newIssues) *
          100
        ).toFixed(1)
      : 100;
  const internalLoss =
    inspectionMetrics.internalLoss + qualityLossMetrics.manualLoss;
  // D1: external KPI uses net loss (gross cost minus recovered claim)
  const externalLoss = afterSalesMetrics.netLoss;
  return {
    passRate: passRateSummary.passRate,
    closingRate: Number(closingRate),
    internalLoss,
    externalLoss,
  };
}

async function fetchProcessPassRates(start: Date, end: Date) {
  const getTargetPassRate = await createPassRateTargetResolver();
  const drillDown = await getPassRateDrillDownByRange(
    start,
    end,
    getTargetPassRate,
  );
  return drillDown.map((row) => ({
    processName: row.process,
    category: row.category,
    total: row.totalCount,
    passed: row.passCount,
    passRate: row.passRate,
    targetPassRate: row.targetPassRate,
  }));
}

async function fetchDefectDistribution(start: Date, end: Date) {
  const rows = await InspectionService.getReportDefectRows({ start, end });
  const countByDefectTypeId = new Map<null | string, number>();
  for (const row of rows) {
    const id = String(row.defectTypeId || '').trim() || null;
    countByDefectTypeId.set(id, (countByDefectTypeId.get(id) || 0) + 1);
  }
  const defectTypeNameById =
    await MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
      configKey: 'defectType',
      canonicalIds: [...countByDefectTypeId.keys()],
    });
  return [...countByDefectTypeId.entries()]
    .map(([id, value]) =>
      createIdentityAggregateItem({
        canonicalName: id ? defectTypeNameById.get(id) : null,
        id,
        missingName: QMS_DEFAULT_VALUES.UNCLASSIFIED,
        value,
      }),
    )
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

async function fetchTopRiskProjects(start: Date, end: Date) {
  return InspectionService.getReportTopRiskProjects({ start, end });
}

async function fetchSupplierPerformance(start: Date, end: Date) {
  const stats = await InspectionService.getReportSupplierPerformance({
    start,
    end,
  });
  return stats
    .map((s) => ({ name: s.supplierName, issues: s._count }))
    .sort((a, b) => a.issues - b.issues);
}

async function fetchMajorEvents(start: Date, end: Date) {
  return InspectionService.getReportMajorEvents({ start, end });
}

function getReportPeriods(date: Date, type: string) {
  return {
    current: resolveReportPeriodRange({
      anchorDate: date,
      granularity: type === 'weekly' ? 'week' : 'month',
    }),
  };
}

function shiftDate(date: Date, type: string, amount: number) {
  return shiftReportAnchorDate({
    amount,
    anchorDate: date,
    granularity: type === 'weekly' ? 'week' : 'month',
  });
}

function calculateTrend(curr: number, prev: number, lowerIsBetter = false) {
  if (!prev) return 0;
  const val = Number((((curr - prev) / prev) * 100).toFixed(1));
  return lowerIsBetter ? -val : val;
}

function formatDateShort(date: Date, type: string) {
  return resolveReportShortLabel({
    date,
    granularity: type === 'weekly' ? 'week' : 'month',
  });
}
