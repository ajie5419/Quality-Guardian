import { Prisma } from '@prisma/client';
import { roundPercent } from '~/modules/report/pass-rate-process';
import prisma from '~/utils/prisma';

export type PassRateFactSnapshot = {
  createdAtCutoff: Date;
  idCutoff: string;
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
