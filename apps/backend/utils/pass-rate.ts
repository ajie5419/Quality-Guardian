import { getTargetPassRate as getTargetPassRateByStd } from '~/constants/quality-standards';
import prisma from '~/utils/prisma';

interface DrillDownItem {
  category: string;
  passCount: number;
  passRate: number;
  process: string;
  targetPassRate: number;
  totalCount: number;
}

interface NetPassRateSummary {
  passCount: number;
  passRate: number;
  totalCount: number;
}

type InspectionPassRateRow = {
  category: string;
  incomingType: null | string;
  processName: null | string;
  qualifiedQuantity: null | number;
  quantity: number;
  result: string;
  unqualifiedQuantity: null | number;
};

type InspectionQuantitySummary = {
  qualifiedQuantity: number;
  quantity: number;
  unqualifiedQuantity: number;
};

const DEFAULT_PASS_RATE_TARGETS: Record<string, number> = {
  原材料: 99.8,
  辅材: 99.9,
  外购件: 99.8,
  机加件: 99.9,
  下料: 99.9,
  组对: 99.85,
  焊接: 99.85,
  机加: 99.9,
  涂装: 99.85,
  组装: 99.85,
  装配: 99.85,
  外协: 99.85,
  成品检验: 99.85,
  设计: 99.85,
};

const GLOBAL_DEFAULT_TARGET = 99.85;

function roundPercent(value: number) {
  return Number(value.toFixed(2));
}

const PROCESS_MAPPING: Record<string, string> = {
  设计: '设计',
  组对: '组焊',
  焊接: '组焊',
  焊后尺寸: '组焊',
  组装: '组装',
  装配: '组装',
  组拼: '组装',
  打砂: '涂装',
  喷漆: '涂装',
  下料: '下料',
  机加: '机加',
  外观: '',
  整体拼装: '',
};

function normalizeInspectionQuantitySummary(
  item: InspectionPassRateRow,
): InspectionQuantitySummary {
  const totalQuantity = Math.max(1, Number(item.quantity) || 1);
  const rawQualified = Number(item.qualifiedQuantity);
  const rawUnqualified = Number(item.unqualifiedQuantity);
  const hasQualified = Number.isFinite(rawQualified);
  const hasUnqualified = Number.isFinite(rawUnqualified);

  if (
    hasQualified &&
    hasUnqualified &&
    rawQualified + rawUnqualified === totalQuantity
  ) {
    return {
      quantity: totalQuantity,
      qualifiedQuantity: rawQualified,
      unqualifiedQuantity: rawUnqualified,
    };
  }

  if (hasUnqualified) {
    const unqualifiedQuantity = Math.max(
      0,
      Math.min(totalQuantity, rawUnqualified),
    );
    return {
      quantity: totalQuantity,
      qualifiedQuantity: totalQuantity - unqualifiedQuantity,
      unqualifiedQuantity,
    };
  }

  if (hasQualified) {
    const qualifiedQuantity = Math.max(
      0,
      Math.min(totalQuantity, rawQualified),
    );
    return {
      quantity: totalQuantity,
      qualifiedQuantity,
      unqualifiedQuantity: totalQuantity - qualifiedQuantity,
    };
  }

  return item.result === 'FAIL'
    ? {
        quantity: totalQuantity,
        qualifiedQuantity: 0,
        unqualifiedQuantity: totalQuantity,
      }
    : {
        quantity: totalQuantity,
        qualifiedQuantity: totalQuantity,
        unqualifiedQuantity: 0,
      };
}

async function getInspectionPassRateRows(start: Date, end: Date) {
  return prisma.inspections.findMany({
    where: { isDeleted: false, inspectionDate: { gte: start, lte: end } },
    select: {
      category: true,
      incomingType: true,
      processName: true,
      quantity: true,
      qualifiedQuantity: true,
      unqualifiedQuantity: true,
      result: true,
    },
  });
}

export async function createPassRateTargetResolver() {
  const setting = await prisma.system_settings.findUnique({
    where: { key: 'QMS_PASS_RATE_TARGETS' },
  });

  let targets = { ...DEFAULT_PASS_RATE_TARGETS };
  if (setting?.value) {
    try {
      const saved = JSON.parse(setting.value);
      targets = { ...targets, ...saved };
    } catch {
      // 忽略脏配置，回退默认目标值
    }
  }

  return (processName?: string): number => {
    if (!processName) return GLOBAL_DEFAULT_TARGET;
    return targets[processName] ?? getTargetPassRateByStd(processName);
  };
}

export async function getNetPassRateSummaryByRange(
  start: Date,
  end: Date,
): Promise<NetPassRateSummary> {
  const inspections = await getInspectionPassRateRows(start, end);

  const summary = { totalCount: 0, passCount: 0 };
  for (const item of inspections) {
    const quantities = normalizeInspectionQuantitySummary(item);
    summary.totalCount += quantities.quantity;
    summary.passCount += quantities.qualifiedQuantity;
  }

  return {
    totalCount: summary.totalCount,
    passCount: summary.passCount,
    passRate:
      summary.totalCount > 0
        ? roundPercent((summary.passCount / summary.totalCount) * 100)
        : 0,
  };
}

export async function getPassRateDrillDownByRange(
  start: Date,
  end: Date,
  getTargetPassRate: (name?: string) => number,
): Promise<DrillDownItem[]> {
  const drillDown: DrillDownItem[] = [];
  const inspections = await getInspectionPassRateRows(start, end);

  const incomingTypes = [
    ...new Set(
      inspections
        .filter((item) => item.category === 'INCOMING')
        .map((item) => (item.incomingType || '未分类') as string),
    ),
  ];

  for (const type of incomingTypes) {
    const items = inspections.filter(
      (item) =>
        item.category === 'INCOMING' &&
        (item.incomingType || '未分类') === type,
    );

    const summary = { totalCount: 0, passCount: 0 };
    for (const item of items) {
      const quantities = normalizeInspectionQuantitySummary(item);
      summary.totalCount += quantities.quantity;
      summary.passCount += quantities.qualifiedQuantity;
    }

    drillDown.push({
      process: String(type),
      category: '来料检验',
      passRate:
        summary.totalCount > 0
          ? roundPercent((summary.passCount / summary.totalCount) * 100)
          : 0,
      targetPassRate: getTargetPassRate(String(type)),
      totalCount: summary.totalCount,
      passCount: summary.passCount,
    });
  }

  const processStats: Record<
    string,
    { passCount: number; totalCount: number }
  > = {};

  for (const item of inspections.filter(
    (record) => record.category === 'PROCESS',
  )) {
    const rawProcess = item.processName || '';
    const mappedName = PROCESS_MAPPING[rawProcess];

    if (!mappedName || mappedName === '设计') continue;

    if (!processStats[mappedName]) {
      processStats[mappedName] = { totalCount: 0, passCount: 0 };
    }

    const quantities = normalizeInspectionQuantitySummary(item);
    processStats[mappedName].totalCount += quantities.quantity;
    processStats[mappedName].passCount += quantities.qualifiedQuantity;
  }

  for (const [name, stats] of Object.entries(processStats)) {
    drillDown.push({
      process: name,
      category: '过程检验',
      passRate:
        stats.totalCount > 0
          ? roundPercent((stats.passCount / stats.totalCount) * 100)
          : 0,
      targetPassRate: getTargetPassRate(name),
      totalCount: stats.totalCount,
      passCount: stats.passCount,
    });
  }

  return drillDown;
}
