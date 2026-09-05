import type { AccessScope } from '~/modules/data-scope';

import { Prisma } from '@prisma/client';
import { DataScopeService } from '~/modules/data-scope';
import prisma from '~/utils/prisma';
import { parsePagination } from '~/utils/query-helpers';

export interface SupplierHistoryProject {
  lastSubmittedAt: null | string;
  projectName: null | string;
  workOrderNumber: string;
}

function buildRequestIdentityFilter(params: {
  identitySource: 'supplier' | 'team';
  supplierId: string;
  teamIds: string[];
}) {
  return params.identitySource === 'team'
    ? Prisma.sql`request_row.teamId IN (${Prisma.join(params.teamIds)})`
    : Prisma.sql`request_row.supplierId = ${params.supplierId}`;
}

export async function buildRequestHistoryRawScopeSql(
  userContext: { userId: string; username?: string },
  dataScope?: AccessScope,
) {
  if (!dataScope) return Prisma.sql`AND 1 = 0`;
  if (dataScope.scopeType === 'ALL') return Prisma.empty;
  if (dataScope.scopeType === 'SELF') {
    // The request domain restricts non-dispatch users to their own related
    // requests (inspector/reporter), mirroring the request list scope model.
    return Prisma.sql`AND (request_row.inspectorId = ${userContext.userId} OR request_row.reporterId = ${userContext.userId})`;
  }
  if (dataScope.scopeType !== 'DEPT') return Prisma.sql`AND 1 = 0`;
  const deptCandidates = await DataScopeService.getDeptCandidates(
    dataScope.deptIds ?? [],
  );
  if (deptCandidates.length === 0) return Prisma.sql`AND 1 = 0`;
  return Prisma.sql`AND request_row.responsibleDepartment IN (${Prisma.join(deptCandidates)})`;
}

function buildSupplierRequestWorkOrdersSql(params: {
  identitySource: 'supplier' | 'team';
  rawScopeSql: Prisma.Sql;
  supplierId: string;
  teamIds: string[];
}) {
  const identityFilter = buildRequestIdentityFilter(params);
  return Prisma.sql`
    SELECT request_row.workOrderNumber, request_row.submittedAt
    FROM qms_inspection_requests AS request_row
    WHERE request_row.isDeleted = 0 AND ${identityFilter} ${params.rawScopeSql}

    UNION ALL

    SELECT request_work_order.workOrderNumber, request_row.submittedAt
    FROM qms_inspection_request_work_orders AS request_work_order
    INNER JOIN qms_inspection_requests AS request_row
      ON request_row.id = request_work_order.requestId
    WHERE request_row.isDeleted = 0 AND ${identityFilter} ${params.rawScopeSql}
  `;
}

export const InspectionRequestHistoryService = {
  async getSupplierHistoryProjects(params: {
    dataScope?: AccessScope;
    identitySource: 'supplier' | 'team';
    page?: number;
    pageSize?: number;
    supplierId: string;
    teamIds: string[];
    userContext?: { userId: string; username?: string };
  }): Promise<{ items: SupplierHistoryProject[]; total: number }> {
    if (params.identitySource === 'team' && params.teamIds.length === 0) {
      return { items: [], total: 0 };
    }

    const { pageSize, skip } = parsePagination(params);
    const rawScopeSql = params.userContext?.userId
      ? await buildRequestHistoryRawScopeSql(
          params.userContext,
          params.dataScope,
        )
      : Prisma.empty;
    const requestWorkOrdersSql = buildSupplierRequestWorkOrdersSql({
      ...params,
      rawScopeSql,
    });
    const [countRows, rows] = await Promise.all([
      prisma.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
        SELECT COUNT(*) AS total
        FROM (
          SELECT history_row.workOrderNumber
          FROM (${requestWorkOrdersSql}) AS history_row
          GROUP BY history_row.workOrderNumber
        ) AS grouped_history
      `),
      prisma.$queryRaw<
        Array<{
          lastSubmittedAt: Date | null;
          projectName: null | string;
          workOrderNumber: string;
        }>
      >(Prisma.sql`
        SELECT
          history_row.workOrderNumber,
          MAX(history_row.submittedAt) AS lastSubmittedAt,
          MAX(work_order.projectName) AS projectName
        FROM (${requestWorkOrdersSql}) AS history_row
        LEFT JOIN work_orders AS work_order
          ON work_order.workOrderNumber = history_row.workOrderNumber
        GROUP BY history_row.workOrderNumber
        ORDER BY lastSubmittedAt DESC, history_row.workOrderNumber ASC
        LIMIT ${pageSize} OFFSET ${skip}
      `),
    ]);

    return {
      items: rows.map((row) => ({
        workOrderNumber: row.workOrderNumber,
        projectName: row.projectName,
        lastSubmittedAt: row.lastSubmittedAt?.toISOString() ?? null,
      })),
      total: Number(countRows[0]?.total || 0),
    };
  },
};
