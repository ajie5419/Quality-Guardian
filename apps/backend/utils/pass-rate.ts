import type { ProcessPassRateTargetKey } from '~/utils/pass-rate-process';

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

export type PassRateSource = 'inspection' | 'issue';

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

type IssuePassRateRow = {
  category: null | string;
  incomingType: null | string;
  inspectionCategory: null | string;
  inspectionIncomingType: null | string;
  inspectionProcessName: null | string;
  inspectionTeam: null | string;
  processName: null | string;
  quantity: number;
  responsibleDepartment: string;
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
  source: PassRateSource = 'inspection',
): Promise<NetPassRateSummary> {
  if (source === 'issue') {
    return getIssuePassRateSummaryByRange(start, end);
  }

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

async function getIssuePassRateSummaryByRange(
  start: Date,
  end: Date,
): Promise<NetPassRateSummary> {
  const [inspectionSummary, issueSummary] = await Promise.all([
    prisma.inspections.aggregate({
      where: { isDeleted: false, inspectionDate: { gte: start, lte: end } },
      _sum: { quantity: true },
    }),
    prisma.quality_records.aggregate({
      where: { isDeleted: false, date: { gte: start, lte: end } },
      _sum: { quantity: true },
    }),
  ]);

  const totalCount = Number(inspectionSummary._sum.quantity || 0);
  const unqualifiedCount = Math.max(
    0,
    Math.min(totalCount, Number(issueSummary._sum.quantity || 0)),
  );
  const passCount = Math.max(0, totalCount - unqualifiedCount);

  return {
    totalCount,
    passCount,
    passRate: totalCount > 0 ? roundPercent((passCount / totalCount) * 100) : 0,
  };
}

async function getIssuePassRateRows(start: Date, end: Date) {
  const issues = await prisma.quality_records.findMany({
    where: { isDeleted: false, date: { gte: start, lte: end } },
    select: {
      category: true,
      processName: true,
      quantity: true,
      responsibleDepartment: true,
      inspection: {
        select: {
          category: true,
          incomingType: true,
          processName: true,
          team: true,
        },
      },
    },
  });

  return issues.map<IssuePassRateRow>((item) => ({
    category: item.category,
    incomingType: null,
    inspectionCategory: item.inspection?.category || null,
    inspectionIncomingType: item.inspection?.incomingType || null,
    inspectionProcessName: item.inspection?.processName || null,
    inspectionTeam: item.inspection?.team || null,
    processName: item.processName,
    quantity: item.quantity,
    responsibleDepartment: item.responsibleDepartment,
  }));
}

const INCOMING_ISSUE_BUCKET_ALIASES: Record<string, string> = {
  原材料: '原材料',
  外购件: '外购件',
  辅材: '辅材',
  机加成品件: '机加成品件',
  成品检验: '外购件',
};

function normalizeIssueBucketText(value: null | string) {
  return String(value || '')
    .trim()
    .replaceAll(/\s+/g, '')
    .replaceAll(/[：:]/g, '');
}

function getIssueQuantity(item: IssuePassRateRow) {
  return Math.max(0, Number(item.quantity) || 0);
}

function getLinkedIssueCategory(item: IssuePassRateRow) {
  const category = String(item.inspectionCategory || '')
    .trim()
    .toUpperCase();
  if (category === 'PROCESS' || category === 'INCOMING') return category;
  return undefined;
}

function resolveIssueProcessBucket(
  item: IssuePassRateRow,
): ProcessPassRateTargetKey | undefined {
  return mapInspectionToPassRateBucket({
    processName: item.inspectionProcessName || item.processName,
    team: item.inspectionTeam || item.responsibleDepartment,
  });
}

function resolveIssueIncomingBucket(item: IssuePassRateRow) {
  const candidates = [
    item.inspectionIncomingType,
    item.incomingType,
    item.processName,
    item.category,
    item.inspectionProcessName,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeIssueBucketText(candidate);
    if (normalized && INCOMING_ISSUE_BUCKET_ALIASES[normalized]) {
      return INCOMING_ISSUE_BUCKET_ALIASES[normalized];
    }
  }

  return undefined;
}

function resolveIssuePassRateCategory(item: IssuePassRateRow) {
  const linkedCategory = getLinkedIssueCategory(item);
  if (linkedCategory) return linkedCategory;
  if (resolveIssueIncomingBucket(item)) return 'INCOMING';
  if (resolveIssueProcessBucket(item)) return 'PROCESS';
  return undefined;
}

export async function getPassRateDrillDownByRange(
  start: Date,
  end: Date,
  getTargetPassRate: (name?: string) => number,
  source: PassRateSource = 'inspection',
): Promise<DrillDownItem[]> {
  const drillDown: DrillDownItem[] = [];
  const inspections = await getInspectionPassRateRows(start, end);
  const issueRows =
    source === 'issue' ? await getIssuePassRateRows(start, end) : [];

  const processStats: Record<
    string,
    { passCount: number; totalCount: number; unqualifiedCount: number }
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
      processStats[mappedName] = {
        totalCount: 0,
        passCount: 0,
        unqualifiedCount: 0,
      };
    }

    const quantities = normalizeInspectionQuantitySummary(item);
    processStats[mappedName].totalCount += quantities.quantity;
    if (source === 'inspection') {
      processStats[mappedName].passCount += quantities.qualifiedQuantity;
    }
  }

  for (const item of issueRows) {
    if (resolveIssuePassRateCategory(item) !== 'PROCESS') continue;
    const mappedName = resolveIssueProcessBucket(item);
    if (!mappedName || !processStats[mappedName]) continue;
    processStats[mappedName].unqualifiedCount += getIssueQuantity(item);
  }

  for (const [name, stats] of Object.entries(processStats)) {
    const passCount =
      source === 'issue'
        ? Math.max(0, stats.totalCount - stats.unqualifiedCount)
        : stats.passCount;
    drillDown.push({
      process: name,
      category: '过程检验',
      passRate:
        stats.totalCount > 0
          ? roundPercent((passCount / stats.totalCount) * 100)
          : 0,
      targetPassRate: getTargetPassRate(name),
      totalCount: stats.totalCount,
      passCount,
    });
  }

  // --- 进货检验（INCOMING）按 incomingType 分桶统计 ---
  const incomingStats: Record<
    string,
    { passCount: number; totalCount: number; unqualifiedCount: number }
  > = {};

  for (const item of inspections.filter(
    (record) => record.category === 'INCOMING',
  )) {
    const bucketName = String(
      item.incomingType || item.processName || '',
    ).trim();
    if (!bucketName) continue;

    if (!incomingStats[bucketName]) {
      incomingStats[bucketName] = {
        totalCount: 0,
        passCount: 0,
        unqualifiedCount: 0,
      };
    }

    const quantities = normalizeInspectionQuantitySummary(item);
    incomingStats[bucketName].totalCount += quantities.quantity;
    if (source === 'inspection') {
      incomingStats[bucketName].passCount += quantities.qualifiedQuantity;
    }
  }

  for (const item of issueRows) {
    if (resolveIssuePassRateCategory(item) !== 'INCOMING') continue;
    const bucketName = String(
      resolveIssueIncomingBucket(item) ||
        item.inspectionIncomingType ||
        item.incomingType ||
        item.processName ||
        '',
    ).trim();
    if (!bucketName || !incomingStats[bucketName]) continue;
    incomingStats[bucketName].unqualifiedCount += getIssueQuantity(item);
  }

  for (const [name, stats] of Object.entries(incomingStats)) {
    const passCount =
      source === 'issue'
        ? Math.max(0, stats.totalCount - stats.unqualifiedCount)
        : stats.passCount;
    drillDown.push({
      process: name,
      category: '进货检验',
      passRate:
        stats.totalCount > 0
          ? roundPercent((passCount / stats.totalCount) * 100)
          : 0,
      targetPassRate: getTargetPassRate(name),
      totalCount: stats.totalCount,
      passCount,
    });
  }

  return drillDown;
}
