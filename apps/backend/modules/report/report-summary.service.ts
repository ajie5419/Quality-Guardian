import {
  mapInspectionArchiveStatusLabel,
  parseDailySummaryContent,
  parseReportPeriodType,
  resolveReportPeriodRange,
  resolveReportShortLabel,
  shiftReportAnchorDate,
} from '@qgs/shared';
import { AfterSalesService } from '~/modules/after-sales';
import { InspectionService } from '~/modules/inspection';
import { QualityLossService } from '~/modules/quality-loss';
import { VehicleCommissioningDailyReportStorageService } from '~/modules/vehicle-commissioning/daily-report-storage.service';
import {
  resolveInspectionFormProcess,
  resolveInspectionFormProcessCandidates,
} from '~/utils/inspection-form';
import { MasterDataGovernanceKernel } from '~/utils/master-data-governance-kernel';
import {
  createPassRateTargetResolver,
  getNetPassRateSummaryByRange,
  getPassRateDrillDownByRange,
} from '~/utils/pass-rate';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';
import { resolveCanonicalProcessName } from '~/utils/process-resolver';

import {
  formatReportDate,
  getReportDayRange,
  resolveReportQueryDate,
} from './report-utils';

class ReportQueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportQueryValidationError';
  }
}

type DailyInspectionRow = {
  category: string;
  id: string;
  incomingType?: null | string;
  inspectionDate?: Date;
  process?: null | {
    name?: null | string;
  };
  processName?: null | string;
  projectName?: null | string;
  workOrderNumber: string;
};

type ArchiveTaskRow = Awaited<
  ReturnType<typeof InspectionService.getDailyArchiveReportData>
>['tasks'][number];

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
    const { date: parsedQueryDate, valid: isDateValid } =
      resolveReportQueryDate(input.date);
    if (!isDateValid) {
      throw new ReportQueryValidationError('Invalid date parameter');
    }
    const queryDate = formatReportDate(parsedQueryDate);
    const queryUser = input.user || input.username;
    const reporter = input.realName || queryUser;
    const { end: endDate, start: startDate } = getReportDayRange(
      new Date(queryDate),
    );
    const inspections = await InspectionService.getDailyReportInspections({
      end: endDate,
      realName: input.realName,
      start: startDate,
      username: queryUser,
    });
    const issues = await InspectionService.getDailyReportIssues({
      end: endDate,
      start: startDate,
      username: queryUser,
    });
    interface ProcessItem {
      partNames: Set<string>;
      process: string;
      projectName: string;
      quantity: number;
      results: Set<string>;
      workOrder: string;
    }
    const processMap = new Map<string, ProcessItem>();
    const formattedInspections: Array<{
      partName: string;
      process: string;
      projectName: string;
      quantity: number;
      result: string;
      seq: number;
      workOrder: string;
    }> = [];
    inspections.forEach((item) => {
      let proc = '';
      let name = '';
      switch (item.category) {
        case 'INCOMING': {
          proc = '进货检验';
          name = item.materialName || '';
          break;
        }
        case 'PROCESS': {
          proc = resolveCanonicalProcessName(item) || '';
          name = item.level2Component || item.level1Component || '';
          break;
        }
        case 'SHIPMENT': {
          proc = '发货检验';
          name =
            item.materialName ||
            item.level2Component ||
            item.level1Component ||
            '';
          break;
        }
        default: {
          proc = resolveCanonicalProcessName(item) || item.category || '';
          name = item.materialName || item.level1Component || '';
        }
      }
      const key = `${item.workOrderNumber}::${proc}`;
      if (!processMap.has(key)) {
        processMap.set(key, {
          partNames: new Set<string>(),
          process: proc,
          projectName: item.projectName || '',
          quantity: 0,
          results: new Set<string>(),
          workOrder: item.workOrderNumber,
        });
      }
      const group = processMap.get(key);
      if (!group) return;
      if (!group.projectName && item.projectName)
        group.projectName = item.projectName;
      if (name) group.partNames.add(name);
      group.quantity += item.quantity;
      group.results.add(item.result === 'PASS' ? '合格' : '不合格');
    });
    for (const group of processMap.values()) {
      const resultStatus = group.results.has('不合格') ? '不合格' : '合格';
      formattedInspections.push({
        partName: [...group.partNames].join('、'),
        process: group.process,
        projectName: group.projectName,
        quantity: group.quantity,
        result: resultStatus,
        seq: 0,
        workOrder: group.workOrder,
      });
    }
    formattedInspections.forEach((item, index) => {
      item.seq = index + 1;
    });
    const formattedIssues = issues.map((item, index) => {
      const created = new Date(item.createdAt);
      const isToday = created >= startDate && created <= endDate;
      return {
        dept: item.responsibleDepartment,
        description: item.description,
        isToday,
        partName: item.partName,
        projectName: item.projectName || item.work_orders?.projectName || '',
        seq: index + 1,
        solution: item.solution || '待定',
        status: item.status,
        workOrder: item.workOrderNumber,
      };
    });
    const dailyArchive = await loadDailyArchiveTasks(inspections);
    const existingReport =
      await VehicleCommissioningDailyReportStorageService.findDailyReportByDateReporter(
        {
          date: new Date(queryDate),
          reporter: queryUser,
        },
      );
    const storedContent = parseDailySummaryContent(existingReport?.summary);
    return {
      archiveStats: dailyArchive.stats,
      date: queryDate,
      documentItems: dailyArchive.items,
      engineeringTodos: dailyArchive.engineeringTodos,
      inspections: formattedInspections,
      issues: formattedIssues,
      reporter,
      summary: existingReport?.reportText || storedContent.summary,
    };
  },
};

async function loadDailyArchiveTasks(inspections: DailyInspectionRow[]) {
  try {
    const inspectionIds = inspections.map((item) => item.id).filter(Boolean);
    const workOrderNumbers = [
      ...new Set(
        inspections
          .map((item) => String(item.workOrderNumber || '').trim())
          .filter(Boolean),
      ),
    ];
    const { tasks, templates } =
      await InspectionService.getDailyArchiveReportData({
        inspectionIds,
        workOrderNumbers,
      });
    const planProcessMap = new Map<string, Set<string>>();
    for (const template of templates) {
      const workOrderNumber = String(template.workOrderNumber || '').trim();
      if (!workOrderNumber) continue;
      const stepSet = planProcessMap.get(workOrderNumber) || new Set<string>();
      const step = resolveCanonicalProcessName(template);
      if (step) stepSet.add(step);
      planProcessMap.set(workOrderNumber, stepSet);
    }
    const taskMap = new Map(tasks.map((item) => [item.inspectionId, item]));
    const taskFallbackMap = new Map<string, ArchiveTaskRow[]>();
    for (const task of tasks) {
      const taskWorkOrder = String(task.workOrderNumber || '').trim();
      if (!taskWorkOrder || !task.inspection) continue;
      const candidates = resolveInspectionFormProcessCandidates({
        category: task.inspection.category || '',
        incomingType: task.inspection.incomingType || '',
        processName: resolveCanonicalProcessName(task.inspection) || '',
      });
      for (const candidate of candidates) {
        const key = `${taskWorkOrder}::${candidate}`;
        const list = taskFallbackMap.get(key) || [];
        list.push(task);
        taskFallbackMap.set(key, list);
      }
    }
    const orderedInspections = [...inspections].sort((a, b) =>
      String(a.workOrderNumber || '').localeCompare(
        String(b.workOrderNumber || ''),
      ),
    );
    const now = new Date();
    let requiredCount = 0;
    let archivedCount = 0;
    let overdueCount = 0;
    let missingTemplateCount = 0;
    const engineeringTodos: Array<{
      processName: string;
      projectName: string;
      seq: number;
      status: string;
      workOrder: string;
    }> = [];
    const items = orderedInspections.map((inspection, index) => {
      const inspectionId = String(inspection.id || '').trim();
      const workOrder = String(inspection.workOrderNumber || '').trim();
      const normalizedInspection = {
        ...inspection,
        processName: resolveCanonicalProcessName(inspection) || '',
      };
      const processName = resolveInspectionFormProcess(normalizedInspection);
      const processCandidates =
        resolveInspectionFormProcessCandidates(normalizedInspection);
      const processSet = planProcessMap.get(workOrder);
      const hasTemplate = Boolean(
        processSet &&
          processCandidates.some((candidate) => processSet.has(candidate)),
      );
      let task = inspectionId ? taskMap.get(inspectionId) : undefined;
      if (!task && processCandidates.length > 0 && workOrder) {
        for (const candidate of processCandidates) {
          const matchedList = taskFallbackMap.get(`${workOrder}::${candidate}`);
          if (matchedList && matchedList.length > 0) {
            task = matchedList[0];
            break;
          }
        }
      }
      let status = 'PENDING';
      let workContent = '';
      if (!hasTemplate) {
        status = 'TEMPLATE_MISSING';
        workContent = `${processName || '当前工序'}检验表未编制`;
        missingTemplateCount += 1;
        engineeringTodos.push({
          processName: processName || '-',
          projectName: String(inspection.projectName || ''),
          seq: engineeringTodos.length + 1,
          status: '待编制',
          workOrder,
        });
      } else if (task) {
        requiredCount += 1;
        status = String(task.status || 'PENDING').toUpperCase();
        if (status === 'ARCHIVED') archivedCount += 1;
        else if (now > task.dueAt) overdueCount += 1;
        workContent = String(task.workContent || '').trim();
      } else {
        requiredCount += 1;
        workContent = `${processName || '当前工序'}检验表待归档`;
      }
      if (!workContent) workContent = `${processName || '检验资料'}归档`;
      return {
        projectName: String(inspection.projectName || ''),
        seq: index + 1,
        status: mapInspectionArchiveStatusLabel(status),
        workContent,
        workOrder,
      };
    });
    const timelinessRate =
      requiredCount > 0
        ? Number(((archivedCount / requiredCount) * 100).toFixed(2))
        : 0;
    return {
      engineeringTodos,
      items,
      stats: {
        archivedCount,
        missingTemplateCount,
        overdueCount,
        requiredCount,
        timelinessRate,
      },
    };
  } catch (error) {
    if (isPrismaSchemaMismatchError(error)) {
      return {
        engineeringTodos: [],
        items: [],
        stats: {
          archivedCount: 0,
          missingTemplateCount: 0,
          overdueCount: 0,
          requiredCount: 0,
          timelinessRate: 0,
        },
      };
    }
    throw error;
  }
}

async function fetchPeriodMetrics(start: Date, end: Date) {
  const [
    passRateSummary,
    inspectionMetrics,
    afterSalesMetrics,
    qualityLossMetrics,
  ] = await Promise.all([
    getNetPassRateSummaryByRange(start, end),
    InspectionService.getReportPeriodMetrics({ start, end }),
    AfterSalesService.getReportPeriodMetrics({ start, end }),
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
  const externalLoss = afterSalesMetrics.externalLoss;
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
  const defectTypeNameById =
    await MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
      configKey: 'defectType',
      canonicalIds: rows.map((item) => item.defectTypeId),
    });
  const countByDefectType = new Map<string, number>();
  for (const row of rows) {
    const key =
      defectTypeNameById.get(String(row.defectTypeId || '')) ||
      String(row.defectType || '').trim() ||
      '未分类';
    countByDefectType.set(key, (countByDefectType.get(key) || 0) + 1);
  }
  return [...countByDefectType.entries()]
    .map(([defectType, count]) => ({
      defectType,
      _count: {
        defectType: count,
      },
    }))
    .sort((a, b) => b._count.defectType - a._count.defectType)
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
