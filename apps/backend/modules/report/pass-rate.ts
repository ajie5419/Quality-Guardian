import type { AnalyticsAccessContext } from '~/modules/data-scope';
import type {
  InspectionQuantitySource,
  IssuePassRateBucketInput,
} from '~/modules/report/pass-rate-process';

import type { IssuePassRateRow } from './pass-rate-rows';

import { Prisma } from '@prisma/client';
import { getTargetPassRate as getTargetPassRateByStd } from '~/modules/inspection/quality-standards';
import {
  buildCanonicalProcessPassRateTargets,
  getIssueQuantity,
  mapIdentityToPassRateBucket,
  normalizeInspectionQuantitySummary,
  parsePassRateIdentityBindings,
  parsePassRateTargets,
  resolveIssueIncomingBucket,
  roundPercent,
} from '~/modules/report/pass-rate-process';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import {
  resolveCanonicalProcessName,
  resolveIncomingTypeNamesByIds,
} from '~/utils/process-resolver';

import { getIssuePassRateSummaryByRange } from './pass-rate-issue-summary.service';
import {
  getProjectedPassRateDrillDownByRange,
  getProjectedPassRateMonthlyByRange,
  getProjectedPassRateSummaryByRange,
} from './pass-rate-projection-query.service';
import { PassRateProjectionService } from './pass-rate-projection.service';
import {
  getInspectionPassRateRows,
  getIssuePassRateRows,
} from './pass-rate-rows';
import {
  buildInspectionRawScopeSql,
  resolveInspectionScope,
} from './pass-rate-scope';

const logger = createModuleLogger('ReportPassRate');

interface DrillDownItem {
  category: string;
  passCount: number;
  passRate: number;
  process: string;
  targetPassRate: number;
  totalCount: number;
}

async function getActivePassRateGeneration() {
  return PassRateProjectionService.getReadableGeneration();
}

interface NetPassRateSummary {
  passCount: number;
  passRate: number;
  totalCount: number;
}

export type PassRateFactSnapshot = {
  createdAtCutoff: Date;
  idCutoff: string;
};

export type PassRateSource = 'inspection' | 'issue';

const GLOBAL_DEFAULT_TARGET = 99.85;

async function createPassRateBucketResolver() {
  const setting = await prisma.system_settings.findUnique({
    where: { key: 'QMS_PASS_RATE_BUCKET_IDENTITIES' },
    select: { value: true },
  });
  let bindings = parsePassRateIdentityBindings({});
  if (setting?.value) {
    try {
      bindings = parsePassRateIdentityBindings(JSON.parse(setting.value));
    } catch (error) {
      logger.error(
        { err: error, settingKey: 'QMS_PASS_RATE_BUCKET_IDENTITIES' },
        'Failed to parse pass rate identity bindings; using legacy fallback',
      );
    }
  }
  return (input: {
    processId?: null | string;
    processName: null | string;
    team: null | string;
    teamId?: null | string;
  }) => mapIdentityToPassRateBucket(input, bindings);
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
    } catch (error) {
      logger.error(
        { err: error, settingKey: 'QMS_PASS_RATE_TARGETS' },
        'Failed to parse pass rate targets; using defaults',
      );
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
  access?: AnalyticsAccessContext,
): Promise<NetPassRateSummary> {
  if (source === 'issue') {
    return getIssuePassRateSummaryByRange(start, end, access);
  }

  const active = await getActivePassRateGeneration();
  const scope = await resolveInspectionScope(access);
  // The projection table carries no department identity, so it is only safe
  // for ALL-scope (or system) reads; DEPT/SELF callers fall back to the
  // scoped legacy path.
  if (active?.activeGenerationId && (!scope || scope.scopeType === 'ALL')) {
    return getProjectedPassRateSummaryByRange(
      active.activeGenerationId,
      start,
      end,
      active.snapshot,
    );
  }

  return getLegacyInspectionPassRateSummaryByRange(
    start,
    end,
    undefined,
    access,
  );
}

export async function getLegacyInspectionPassRateSummaryByRange(
  start: Date,
  end: Date,
  snapshot?: PassRateFactSnapshot,
  access?: AnalyticsAccessContext,
): Promise<NetPassRateSummary> {
  const scopeSql = await buildInspectionRawScopeSql(access);
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
      ${scopeSql}
      ${
        snapshot
          ? Prisma.sql`
              AND (
                createdAt < ${snapshot.createdAtCutoff}
                OR (createdAt = ${snapshot.createdAtCutoff} AND id <= ${snapshot.idCutoff})
              )
            `
          : Prisma.empty
      }
  `;

  const totalCount = Number(summary?.totalCount || 0);
  const passCount = Number(summary?.passCount || 0);

  return {
    totalCount,
    passCount,
    passRate: totalCount > 0 ? roundPercent((passCount / totalCount) * 100) : 0,
  };
}

export type PassRateMonthlyPoint = {
  month: number;
  passCount: number;
  totalCount: number;
};

async function getLegacyPassRateMonthlyByRange(
  start: Date,
  end: Date,
  access?: AnalyticsAccessContext,
): Promise<PassRateMonthlyPoint[]> {
  const scopeSql = await buildInspectionRawScopeSql(access);
  const rows = await prisma.$queryRaw<
    Array<{
      inspectionDate: Date;
      passCount: bigint | null;
      totalCount: bigint | null;
    }>
  >`
    SELECT
      inspections.inspectionDate AS inspectionDate,
      SUM(quantity) AS totalCount,
      SUM(
        CASE
          WHEN unqualifiedQuantity IS NULL OR unqualifiedQuantity <= 0 THEN quantity
          WHEN unqualifiedQuantity >= quantity THEN 0
          ELSE quantity - unqualifiedQuantity
        END
      ) AS passCount
    FROM inspections
    WHERE isDeleted = 0
      AND inspectionDate >= ${start}
      AND inspectionDate <= ${end}
      ${scopeSql}
    GROUP BY inspections.inspectionDate
  `;
  return rows.map((row) => ({
    // The legacy monthly trend bucketed each inspection by its local month
    // (range [firstDay, lastDay] of the month). Grouping by exact date and
    // deriving the local month in Node keeps that semantics identical while
    // bounding the row set to at most one row per day.
    month: new Date(row.inspectionDate).getMonth(),
    passCount: Number(row.passCount || 0),
    totalCount: Number(row.totalCount || 0),
  }));
}

export async function getPassRateMonthlyTrend(
  start: Date,
  end: Date,
  access?: AnalyticsAccessContext,
): Promise<PassRateMonthlyPoint[]> {
  const active = await getActivePassRateGeneration();
  const scope = await resolveInspectionScope(access);
  if (active?.activeGenerationId && (!scope || scope.scopeType === 'ALL')) {
    const rows = await getProjectedPassRateMonthlyByRange(
      active.activeGenerationId,
      start,
      end,
      active.snapshot,
    );
    return rows.map((row) => ({
      month: new Date(row.inspectionDate).getMonth(),
      passCount: Number(row.passCount || 0),
      totalCount: Number(row.totalCount || 0),
    }));
  }
  return getLegacyPassRateMonthlyByRange(start, end, access);
}

function resolveIssueProcessBucketByIdentity(
  item: IssuePassRateRow,
  resolveBucket: Awaited<ReturnType<typeof createPassRateBucketResolver>>,
) {
  return resolveBucket({
    processId: item.inspectionProcessId || item.processId,
    processName: item.inspectionProcessName || item.processName,
    team: item.inspectionTeam || item.responsibleDepartment,
    teamId: item.inspectionTeamId || item.responsibleDepartmentId,
  });
}

function resolveIssueCategoryByIdentity(
  item: IssuePassRateRow,
  processBucket: string | undefined,
) {
  const linkedCategory = String(item.inspectionCategory || '')
    .trim()
    .toUpperCase();
  if (linkedCategory === 'PROCESS' || linkedCategory === 'INCOMING') {
    return linkedCategory;
  }
  if (resolveIssueIncomingBucket(item)) return 'INCOMING';
  if (processBucket) return 'PROCESS';
  return undefined;
}

export async function getPassRateDrillDownByRange(
  start: Date,
  end: Date,
  getTargetPassRate: (name?: string) => number,
  source: PassRateSource = 'inspection',
  access?: AnalyticsAccessContext,
): Promise<DrillDownItem[]> {
  if (source === 'inspection') {
    const scope = await resolveInspectionScope(access);
    const active = await getActivePassRateGeneration();
    if (active?.activeGenerationId && (!scope || scope.scopeType === 'ALL')) {
      return getProjectedPassRateDrillDownByRange(
        active.activeGenerationId,
        start,
        end,
        active.snapshot,
        getTargetPassRate,
      );
    }
  }
  return getLegacyPassRateDrillDownByRange(
    start,
    end,
    getTargetPassRate,
    source,
    undefined,
    access,
  );
}

export async function getLegacyPassRateDrillDownByRange(
  start: Date,
  end: Date,
  getTargetPassRate: (name?: string) => number,
  source: PassRateSource = 'inspection',
  snapshot?: PassRateFactSnapshot,
  access?: AnalyticsAccessContext,
): Promise<DrillDownItem[]> {
  const drillDown: DrillDownItem[] = [];
  const inspections = await getInspectionPassRateRows(
    start,
    end,
    snapshot,
    access,
  );
  const issueRows =
    source === 'issue' ? await getIssuePassRateRows(start, end, access) : [];
  const resolveBucket = await createPassRateBucketResolver();
  const incomingTypeIds = inspections.map((item) =>
    item.category === 'INCOMING' ? item.incomingTypeId : null,
  );
  const incomingTypeNameById = await resolveIncomingTypeNamesByIds([
    ...incomingTypeIds,
    ...issueRows.map((item) => item.inspectionIncomingTypeId),
  ]);

  const processStats: Record<
    string,
    { passCount: number; totalCount: number; unqualifiedCount: number }
  > = {};

  for (const item of inspections.filter(
    (record) => record.category === 'PROCESS',
  )) {
    const mappedName = resolveBucket({
      processId: item.processId,
      processName: resolveCanonicalProcessName(item),
      team: item.team,
      teamId: item.teamId,
    });
    if (!mappedName) continue;

    if (!processStats[mappedName]) {
      processStats[mappedName] = {
        totalCount: 0,
        passCount: 0,
        unqualifiedCount: 0,
      };
    }

    const quantities = normalizeInspectionQuantitySummary(
      item as InspectionQuantitySource,
    );
    processStats[mappedName].totalCount += quantities.quantity;
    if (source === 'inspection') {
      processStats[mappedName].passCount += quantities.qualifiedQuantity;
    }
  }

  for (const item of issueRows) {
    const issueBucketInput = item as IssuePassRateBucketInput;
    const mappedName = resolveIssueProcessBucketByIdentity(item, resolveBucket);
    if (resolveIssueCategoryByIdentity(item, mappedName) !== 'PROCESS')
      continue;
    if (!mappedName || !processStats[mappedName]) continue;
    processStats[mappedName].unqualifiedCount +=
      getIssueQuantity(issueBucketInput);
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
      incomingTypeNameById.get(item.incomingTypeId || '') ||
        item.incomingType ||
        item.processName ||
        '',
    ).trim();
    if (!bucketName) continue;

    if (!incomingStats[bucketName]) {
      incomingStats[bucketName] = {
        totalCount: 0,
        passCount: 0,
        unqualifiedCount: 0,
      };
    }

    const quantities = normalizeInspectionQuantitySummary(
      item as InspectionQuantitySource,
    );
    incomingStats[bucketName].totalCount += quantities.quantity;
    if (source === 'inspection') {
      incomingStats[bucketName].passCount += quantities.qualifiedQuantity;
    }
  }

  for (const item of issueRows) {
    const issueBucketInput = item as IssuePassRateBucketInput;
    const processBucket = resolveIssueProcessBucketByIdentity(
      item,
      resolveBucket,
    );
    if (resolveIssueCategoryByIdentity(item, processBucket) !== 'INCOMING')
      continue;
    const bucketName = String(
      incomingTypeNameById.get(item.inspectionIncomingTypeId || '') ||
        resolveIssueIncomingBucket(issueBucketInput) ||
        item.inspectionIncomingType ||
        item.incomingType ||
        item.processName ||
        '',
    ).trim();
    if (!bucketName || !incomingStats[bucketName]) continue;
    incomingStats[bucketName].unqualifiedCount +=
      getIssueQuantity(issueBucketInput);
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
