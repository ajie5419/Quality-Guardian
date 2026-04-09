import { getTargetPassRate as getTargetPassRateByStd } from '~/constants/quality-standards';
import {
  buildCanonicalProcessPassRateTargets,
  mapInspectionToPassRateBucket,
  parsePassRateTargets,
} from '~/utils/pass-rate-process';
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
  team: null | string;
  unqualifiedQuantity: null | number;
};

type InspectionQuantitySummary = {
  qualifiedQuantity: number;
  quantity: number;
  unqualifiedQuantity: number;
};

const GLOBAL_DEFAULT_TARGET = 99.85;

function roundPercent(value: number) {
  return Number(value.toFixed(2));
}

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
      team: true,
    },
  });
}

export async function createPassRateTargetResolver() {
  const setting = await prisma.system_settings.findUnique({
    where: { key: 'QMS_PASS_RATE_TARGETS' },
  });

  let targets: Record<string, number> = buildCanonicalProcessPassRateTargets(
    {},
  );
  if (setting?.value) {
    try {
      const saved = parsePassRateTargets(JSON.parse(setting.value));
      const canonicalTargets = buildCanonicalProcessPassRateTargets(saved);
      // Keep non-process custom keys from saved settings (e.g. incoming types),
      // while forcing canonical process keys to current definitions.
      targets = { ...saved, ...canonicalTargets };
    } catch {
      // Ignore dirty config and fallback to defaults
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

  const processStats: Record<
    string,
    { passCount: number; totalCount: number }
  > = {};

  for (const item of inspections.filter(
    (record) => record.category === 'PROCESS',
  )) {
    const mappedName = mapInspectionToPassRateBucket({
      processName: item.processName,
      team: item.team,
    });
    if (!mappedName) continue;

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
