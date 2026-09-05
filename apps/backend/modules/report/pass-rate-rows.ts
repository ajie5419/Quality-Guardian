import type { AnalyticsAccessContext } from '~/modules/data-scope';
import type { PassRateFactSnapshot } from '~/modules/report/pass-rate';

import { Prisma } from '@prisma/client';
import { buildInspectionRawScopeSql } from '~/modules/report/pass-rate-scope';
import prisma from '~/utils/prisma';

/**
 * Pre-aggregated inspection rows for the legacy pass-rate drilldown.
 * Quantity is summed per identity group; unqualifiedQuantity is clamped per
 * inspection row inside SQL so the SUM matches the shared
 * normalizeInspectionQuantitySummary semantics (max(0, min(quantity, raw))).
 */
export type InspectionPassRateAggregateRow = {
  category: string;
  incomingType: null | string;
  incomingTypeId: null | string;
  processId: null | string;
  processName: null | string;
  quantity: number;
  team: null | string;
  teamId: null | string;
  unqualifiedQuantity: number;
};

export type IssuePassRateRow = {
  category: null | string;
  incomingType: null | string;
  inspectionCategory: null | string;
  inspectionIncomingType: null | string;
  inspectionIncomingTypeId: null | string;
  inspectionProcessId: null | string;
  inspectionProcessName: null | string;
  inspectionTeam: null | string;
  inspectionTeamId: null | string;
  processId: null | string;
  processName: null | string;
  quantity: number;
  responsibleDepartment: string;
  responsibleDepartmentId: null | string;
};

type SqlAggregateValue = bigint | null | number | Prisma.Decimal;

function toQuantityNumber(value: SqlAggregateValue | undefined) {
  return Number(value || 0);
}

/**
 * Canonical process name equivalent of resolveCanonicalProcessName:
 * current process-master name first, legacy snapshot name as fallback.
 */
const canonicalProcessNameSql = (table: 'insp' | 'inspections' | 'q') =>
  Prisma.sql`COALESCE(NULLIF(TRIM(${Prisma.raw(table)}_process.name), ''), ${Prisma.raw(table)}.processName)`;

/**
 * Per-row clamped unqualified quantity (shared quantity rule:
 * max(0, min(quantity, unqualifiedQuantity))).
 */
const clampedUnqualifiedSql = (
  table: 'insp' | 'inspections' | 'q',
) => Prisma.sql`
  CASE
    WHEN ${Prisma.raw(table)}.quantity <= 0 THEN 0
    WHEN ${Prisma.raw(table)}.unqualifiedQuantity IS NULL OR ${Prisma.raw(table)}.unqualifiedQuantity <= 0 THEN 0
    WHEN ${Prisma.raw(table)}.unqualifiedQuantity >= ${Prisma.raw(table)}.quantity THEN ${Prisma.raw(table)}.quantity
    ELSE ${Prisma.raw(table)}.unqualifiedQuantity
  END`;

const nonNegativeQuantitySql = (
  table: 'insp' | 'inspections' | 'q',
) => Prisma.sql`
  CASE WHEN ${Prisma.raw(table)}.quantity <= 0 THEN 0 ELSE ${Prisma.raw(table)}.quantity END`;

function buildSnapshotSql(snapshot?: PassRateFactSnapshot): Prisma.Sql {
  if (!snapshot) return Prisma.empty;
  return Prisma.sql`
    AND (
      inspections.createdAt < ${snapshot.createdAtCutoff}
      OR (inspections.createdAt = ${snapshot.createdAtCutoff} AND inspections.id <= ${snapshot.idCutoff})
    )`;
}

export async function getInspectionPassRateRows(
  start: Date,
  end: Date,
  snapshot?: PassRateFactSnapshot,
  access?: AnalyticsAccessContext,
): Promise<InspectionPassRateAggregateRow[]> {
  const scopeSql = await buildInspectionRawScopeSql(access);
  const rows = await prisma.$queryRaw<
    Array<{
      category: string;
      incomingType: null | string;
      incomingTypeId: null | string;
      processId: null | string;
      processName: null | string;
      quantity: SqlAggregateValue;
      team: null | string;
      teamId: null | string;
      unqualifiedQuantity: SqlAggregateValue;
    }>
  >`
    SELECT
      inspections.category AS category,
      inspections.incomingType AS incomingType,
      inspections.incomingTypeId AS incomingTypeId,
      inspections.processId AS processId,
      ${canonicalProcessNameSql('inspections')} AS processName,
      inspections.team AS team,
      inspections.teamId AS teamId,
      SUM(${nonNegativeQuantitySql('inspections')}) AS quantity,
      SUM(${clampedUnqualifiedSql('inspections')}) AS unqualifiedQuantity
    FROM inspections
    LEFT JOIN processes AS inspections_process ON inspections_process.id = inspections.processId
    WHERE inspections.isDeleted = 0
      AND inspections.inspectionDate >= ${start}
      AND inspections.inspectionDate <= ${end}
      ${scopeSql}
      ${buildSnapshotSql(snapshot)}
    GROUP BY
      inspections.category,
      inspections.incomingType,
      inspections.incomingTypeId,
      inspections.processId,
      processName,
      inspections.team,
      inspections.teamId
  `;

  return rows.map((row) => ({
    category: row.category,
    incomingType: row.incomingType,
    incomingTypeId: row.incomingTypeId,
    processId: row.processId,
    processName: row.processName,
    quantity: toQuantityNumber(row.quantity),
    unqualifiedQuantity: toQuantityNumber(row.unqualifiedQuantity),
    team: row.team,
    teamId: row.teamId,
  }));
}

export async function getIssuePassRateRows(
  start: Date,
  end: Date,
  access?: AnalyticsAccessContext,
): Promise<IssuePassRateRow[]> {
  const scopeSql = await buildInspectionRawScopeSql(access);
  // The scope fragment references unqualified columns (responsibleDepartment /
  // inspector), so quality_records is wrapped in a CTE to keep the reference
  // unambiguous against the joined inspections table.
  const rows = await prisma.$queryRaw<
    Array<{
      category: null | string;
      inspectionCategory: null | string;
      inspectionIncomingType: null | string;
      inspectionIncomingTypeId: null | string;
      inspectionProcessId: null | string;
      inspectionProcessName: null | string;
      inspectionTeam: null | string;
      inspectionTeamId: null | string;
      processId: null | string;
      processName: null | string;
      quantity: SqlAggregateValue;
      responsibleDepartment: string;
      responsibleDepartmentId: null | string;
    }>
  >`
    WITH scoped_issues AS (
      SELECT *
      FROM quality_records
      WHERE isDeleted = 0
        AND date >= ${start}
        AND date <= ${end}
        ${scopeSql}
    )
    SELECT
      q.category AS category,
      NULL AS incomingType,
      insp.category AS inspectionCategory,
      insp.incomingType AS inspectionIncomingType,
      insp.incomingTypeId AS inspectionIncomingTypeId,
      insp.processId AS inspectionProcessId,
      ${canonicalProcessNameSql('insp')} AS inspectionProcessName,
      insp.team AS inspectionTeam,
      insp.teamId AS inspectionTeamId,
      q.processId AS processId,
      ${canonicalProcessNameSql('q')} AS processName,
      SUM(${nonNegativeQuantitySql('q')}) AS quantity,
      q.responsibleDepartment AS responsibleDepartment,
      q.responsibleDepartmentId AS responsibleDepartmentId
    FROM scoped_issues AS q
    LEFT JOIN processes AS q_process ON q_process.id = q.processId
    LEFT JOIN inspections AS insp ON insp.id = q.inspectionId
    LEFT JOIN processes AS insp_process ON insp_process.id = insp.processId
    GROUP BY
      q.category,
      insp.category,
      insp.incomingType,
      insp.incomingTypeId,
      insp.processId,
      inspectionProcessName,
      insp.team,
      insp.teamId,
      q.processId,
      processName,
      q.responsibleDepartment,
      q.responsibleDepartmentId
  `;

  return rows.map((row) => ({
    category: row.category,
    incomingType: null,
    inspectionCategory: row.inspectionCategory,
    inspectionIncomingType: row.inspectionIncomingType,
    inspectionIncomingTypeId: row.inspectionIncomingTypeId,
    inspectionProcessId: row.inspectionProcessId,
    inspectionProcessName: row.inspectionProcessName,
    inspectionTeam: row.inspectionTeam,
    inspectionTeamId: row.inspectionTeamId,
    processId: row.processId,
    processName: row.processName,
    quantity: toQuantityNumber(row.quantity),
    responsibleDepartment: row.responsibleDepartment,
    responsibleDepartmentId: row.responsibleDepartmentId,
  }));
}
