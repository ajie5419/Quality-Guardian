import { Prisma } from '@prisma/client';
import { roundPercent } from '~/modules/report/pass-rate-process';
import prisma from '~/utils/prisma';

export type PassRateFactSnapshot = {
  createdAtCutoff: Date;
  idCutoff: string;
};

type PassRateFactChangeBoundary = {
  idCutoff: string;
  updatedAtCutoff: Date;
};

export type PassRateProjectionFreshness = {
  isFresh: boolean;
  projectionSnapshot: PassRateFactSnapshot;
  reason: null | string;
};

export type ProjectedPassRateSummary = {
  passCount: number;
  passRate: number;
  totalCount: number;
};

type ProjectedBucket = {
  passCount: bigint | null;
  processId: null | string;
  state: string;
  totalCount: bigint | null;
};

type ProjectedIncomingBucket = {
  incomingType: null | string;
  passCount: bigint | null;
  totalCount: bigint | null;
};

function snapshotCondition(snapshot: PassRateFactSnapshot) {
  return Prisma.sql`AND (
    p.createdAtSnapshot < ${snapshot.createdAtCutoff}
    OR (p.createdAtSnapshot = ${snapshot.createdAtCutoff} AND p.inspectionId <= ${snapshot.idCutoff})
  )`;
}

function passQuantityExpression() {
  return Prisma.sql`CASE
    WHEN p.unqualifiedQuantity IS NULL OR p.unqualifiedQuantity <= 0 THEN p.quantity
    WHEN p.unqualifiedQuantity >= p.quantity THEN 0
    ELSE p.quantity - p.unqualifiedQuantity
  END`;
}

export async function capturePassRateFactSnapshot(): Promise<PassRateFactSnapshot> {
  const boundary = await prisma.inspections.findFirst({
    where: { isDeleted: false },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { createdAt: true, id: true },
  });
  return {
    createdAtCutoff: boundary?.createdAt || new Date(0),
    idCutoff: boundary?.id || '',
  };
}

/**
 * A shadow run must use the active generation's last materialized fact, not
 * the newest source fact. New backfills after a rebuild then stay outside both
 * calculations instead of being mistaken for an identity-resolution drift.
 */
export async function capturePassRateProjectionSnapshot(
  generationId: string,
): Promise<PassRateFactSnapshot> {
  const boundary = await prisma.pass_rate_process_identity_projection.findFirst(
    {
      where: { generationId },
      orderBy: [{ createdAtSnapshot: 'desc' }, { inspectionId: 'desc' }],
      select: { createdAtSnapshot: true, inspectionId: true },
    },
  );
  return {
    createdAtCutoff: boundary?.createdAtSnapshot || new Date(0),
    idCutoff: boundary?.inspectionId || '',
  };
}

async function capturePassRateFactChangeBoundary(): Promise<PassRateFactChangeBoundary> {
  const boundary = await prisma.inspections.findFirst({
    where: { isDeleted: false },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    select: { id: true, updatedAt: true },
  });
  return {
    idCutoff: boundary?.id || '',
    updatedAtCutoff: boundary?.updatedAt || new Date(0),
  };
}

async function capturePassRateProjectionChangeBoundary(
  generationId: string,
): Promise<PassRateFactChangeBoundary> {
  const boundary = await prisma.pass_rate_process_identity_projection.findFirst(
    {
      where: { generationId },
      orderBy: [{ updatedAtSnapshot: 'desc' }, { inspectionId: 'desc' }],
      select: { inspectionId: true, updatedAtSnapshot: true },
    },
  );
  return {
    idCutoff: boundary?.inspectionId || '',
    updatedAtCutoff: boundary?.updatedAtSnapshot || new Date(0),
  };
}

/**
 * The read model is deliberately not dual-written from every inspection path.
 * Before the feature flag can expose it, compare the full active fact set with
 * the published generation. `updatedAt` catches edits, row counts catch soft
 * deletes, and the boundaries make the common append case inexpensive to
 * diagnose in logs. Any uncertainty fails closed to the legacy report.
 */
export async function getPassRateProjectionFreshness(
  generationId: string,
): Promise<PassRateProjectionFreshness> {
  const [
    sourceSnapshot,
    projectionSnapshot,
    sourceChangeBoundary,
    projectionChangeBoundary,
    sourceCount,
    projectionCount,
    staleSourceRows,
  ] = await Promise.all([
    capturePassRateFactSnapshot(),
    capturePassRateProjectionSnapshot(generationId),
    capturePassRateFactChangeBoundary(),
    capturePassRateProjectionChangeBoundary(generationId),
    prisma.inspections.count({ where: { isDeleted: false } }),
    prisma.pass_rate_process_identity_projection.count({
      where: { generationId },
    }),
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT i.id
      FROM inspections i
      LEFT JOIN pass_rate_process_identity_projection p
        ON p.generationId = ${generationId}
        AND p.inspectionId = i.id
      WHERE i.isDeleted = 0
        AND (
          p.inspectionId IS NULL
          OR p.updatedAtSnapshot IS NULL
          OR p.updatedAtSnapshot <> i.updatedAt
        )
      LIMIT 1
    `,
  ]);
  const sameSnapshot =
    sourceSnapshot.createdAtCutoff.getTime() ===
      projectionSnapshot.createdAtCutoff.getTime() &&
    sourceSnapshot.idCutoff === projectionSnapshot.idCutoff;
  const sameChangeBoundary =
    sourceChangeBoundary.updatedAtCutoff.getTime() ===
      projectionChangeBoundary.updatedAtCutoff.getTime() &&
    sourceChangeBoundary.idCutoff === projectionChangeBoundary.idCutoff;
  const isFresh =
    sameSnapshot &&
    sameChangeBoundary &&
    sourceCount === projectionCount &&
    staleSourceRows.length === 0;
  const reason = isFresh
    ? null
    : [
        sameSnapshot ? null : 'CREATED_FACT_BOUNDARY_CHANGED',
        sameChangeBoundary ? null : 'UPDATED_FACT_BOUNDARY_CHANGED',
        sourceCount === projectionCount ? null : 'ACTIVE_FACT_COUNT_CHANGED',
        staleSourceRows.length === 0 ? null : 'SOURCE_FACT_MISSING_OR_UPDATED',
      ]
        .filter(Boolean)
        .join(',');
  return { isFresh, projectionSnapshot, reason };
}

export async function getProjectedPassRateSummaryByRange(
  generationId: string,
  start: Date,
  end: Date,
  snapshot: PassRateFactSnapshot,
): Promise<ProjectedPassRateSummary> {
  const [summary] = await prisma.$queryRaw<
    Array<{ passCount: bigint | null; totalCount: bigint | null }>
  >`
    SELECT
      SUM(p.quantity) AS totalCount,
      SUM(${passQuantityExpression()}) AS passCount
    FROM pass_rate_process_identity_projection p
    WHERE p.generationId = ${generationId}
      AND p.inspectionDate >= ${start}
      AND p.inspectionDate <= ${end}
      ${snapshotCondition(snapshot)}
  `;
  const totalCount = Number(summary?.totalCount || 0);
  const passCount = Number(summary?.passCount || 0);
  return {
    passCount,
    passRate: totalCount ? roundPercent((passCount / totalCount) * 100) : 0,
    totalCount,
  };
}

export async function getProjectedPassRateDrillDownByRange(
  generationId: string,
  start: Date,
  end: Date,
  snapshot: PassRateFactSnapshot,
  getTargetPassRate: (name?: string) => number,
) {
  const [processBuckets, incomingBuckets] = await Promise.all([
    prisma.$queryRaw<ProjectedBucket[]>`
      SELECT
        p.effectiveProcessId AS processId,
        p.state AS state,
        SUM(p.quantity) AS totalCount,
        SUM(${passQuantityExpression()}) AS passCount
      FROM pass_rate_process_identity_projection p
      WHERE p.generationId = ${generationId}
        AND p.category = 'PROCESS'
        AND p.inspectionDate >= ${start}
        AND p.inspectionDate <= ${end}
        ${snapshotCondition(snapshot)}
      GROUP BY p.effectiveProcessId, p.state
    `,
    prisma.$queryRaw<ProjectedIncomingBucket[]>`
      SELECT
        p.incomingType AS incomingType,
        SUM(p.quantity) AS totalCount,
        SUM(${passQuantityExpression()}) AS passCount
      FROM pass_rate_process_identity_projection p
      WHERE p.generationId = ${generationId}
        AND p.category = 'INCOMING'
        AND p.inspectionDate >= ${start}
        AND p.inspectionDate <= ${end}
        ${snapshotCondition(snapshot)}
      GROUP BY p.incomingType
    `,
  ]);
  const processIds = processBuckets
    .map((item) => item.processId)
    .filter(Boolean);
  const processes = await prisma.processes.findMany({
    where: { id: { in: processIds } },
    select: { id: true, name: true },
  });
  const processNameById = new Map(
    processes.map((item) => [item.id, item.name]),
  );
  const processRows = processBuckets.map((item) => {
    const totalCount = Number(item.totalCount || 0);
    const passCount = Number(item.passCount || 0);
    const process = item.processId
      ? processNameById.get(item.processId) ||
        `[${item.state}] ${item.processId}`
      : `[${item.state}]`;
    return {
      category: '过程检验',
      passCount,
      passRate: totalCount ? roundPercent((passCount / totalCount) * 100) : 0,
      process,
      processId: item.processId,
      state: item.state,
      targetPassRate: getTargetPassRate(process),
      totalCount,
    };
  });
  const incomingRows = incomingBuckets.map((item) => {
    const totalCount = Number(item.totalCount || 0);
    const passCount = Number(item.passCount || 0);
    const process = String(item.incomingType || '').trim() || '[UNRESOLVED]';
    return {
      category: '进货检验',
      passCount,
      passRate: totalCount ? roundPercent((passCount / totalCount) * 100) : 0,
      process,
      processId: null,
      state: null,
      targetPassRate: getTargetPassRate(process),
      totalCount,
    };
  });
  return [...processRows, ...incomingRows];
}
