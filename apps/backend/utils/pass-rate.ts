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
  const totalQuantity = Math.max(0, Number(item.quantity) || 0);
  const rawUnqualified = Number(item.unqualifiedQuantity);
  const hasUnqualified = Number.isFinite(rawUnqualified);
  const unqualifiedQuantity = hasUnqualified
    ? Math.max(0, Math.min(totalQuantity, rawUnqualified))
    : 0;

  return {
    quantity: totalQuantity,
    qualifiedQuantity: totalQuantity - unqualifiedQuantity,
    unqualifiedQuantity,
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
  const [summary] = await prisma.$queryRaw<
    Array<{ passCount: bigint | null; totalCount: bigint | null }>
  >`
    SELECT
      SUM(quantity) as totalCount,
      SUM(
        CASE
          WHEN unqualifiedQuantity IS NULL OR unqualifiedQuantity <= 0 THEN quantity
          WHEN unqualifiedQuantity >= quantity THEN 0
          ELSE quantity - unqualifiedQuantity
        END
      ) as passCount
    FROM inspections
    WHERE isDeleted = 0
      AND inspectionDate >= ${start}
      AND inspectionDate <= ${end}
  `;

  const totalCount = Number(summary?.totalCount || 0);
  const passCount = Number(summary?.passCount || 0);

  return {
    totalCount,
    passCount,
    passRate: totalCount > 0 ? roundPercent((passCount / totalCount) * 100) : 0,
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
