import type { UserSession } from '~/utils/jwt-utils';

import { SupplierIdentityService } from '~/modules/supplier-identity';
import prisma from '~/utils/prisma';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';
import { buildTeamContainsWhere } from '~/utils/team-resolver';

import {
  mapInspectionRequest,
  normalizeInspectionRequestStatus,
  normalizeInspectionRequestText,
  resolveInspectionRequestCurrentUserId,
} from './inspection-request';
import { resolveInspectionRequestIssueResponsibilities } from './inspection-request-responsibility.service';
import { inspectionRequestWorkOrdersInclude } from './inspection-request-work-orders';

function normalizeRequestListQuery(query: Record<string, unknown>) {
  return {
    currentOnly: String(query.current || '') === 'true',
    includeClosed: String(query.includeClosed || '') === 'true',
    inspectorId: normalizeInspectionRequestText(query.inspectorId),
    keyword: normalizeInspectionRequestText(query.keyword),
    mine: String(query.mine || '') === 'true',
    page: Math.max(Number(query.page || 1), 1),
    pageSize: Math.min(Math.max(Number(query.pageSize || 20), 1), 100),
    processName: normalizeInspectionRequestText(query.processName),
    statuses: normalizeRequestListStatuses(query.status),
    team: normalizeInspectionRequestText(query.team),
    workOrderNumber: normalizeInspectionRequestText(query.workOrderNumber),
  };
}

function normalizeRequestListStatuses(value: unknown) {
  return String(value ?? '')
    .split(',')
    .map((item) => normalizeInspectionRequestStatus(item))
    .filter(Boolean);
}

async function buildRequestListWhere(
  userinfo: UserSession,
  query: ReturnType<typeof normalizeRequestListQuery>,
) {
  const currentUserId = query.mine
    ? await resolveInspectionRequestCurrentUserId(userinfo, prisma)
    : null;
  const statusWhere = getRequestListStatusWhere(query);

  return {
    isDeleted: false,
    ...(query.mine && currentUserId ? { inspectorId: currentUserId } : {}),
    ...(!query.mine && query.inspectorId
      ? { inspectorId: query.inspectorId }
      : {}),
    ...statusWhere,
    ...(query.workOrderNumber
      ? { workOrderNumber: query.workOrderNumber }
      : {}),
    ...(query.processName ? { processName: query.processName } : {}),
    ...(query.team ? await buildRequestTeamDisplayWhere(query.team) : {}),
    ...(query.keyword
      ? {
          OR: [
            { requestNo: { contains: query.keyword } },
            { id: { contains: query.keyword } },
            { workOrderNumber: { contains: query.keyword } },
            { partName: { contains: query.keyword } },
            { componentName: { contains: query.keyword } },
            { processName: { contains: query.keyword } },
            { process: { is: { name: { contains: query.keyword } } } },
            { reporter: { contains: query.keyword } },
            await buildRequestTeamDisplayWhere(query.keyword),
          ],
        }
      : {}),
  };
}

async function buildRequestTeamDisplayWhere(keyword: string) {
  return {
    OR: [
      await buildTeamContainsWhere({ keyword }),
      {
        category: 'PROCESS',
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartment: { contains: keyword },
      },
      {
        category: 'PROCESS',
        responsibilityType: 'OUTSOURCING_UNIT',
        supplierName: { contains: keyword },
      },
    ],
  };
}

function getRequestListStatusWhere(
  query: ReturnType<typeof normalizeRequestListQuery>,
): Record<string, unknown> {
  if (query.mine && query.includeClosed) {
    return { status: { in: ['DISPATCHED', 'INSPECTING', 'CLOSED'] } };
  }
  if (query.statuses.length === 1) {
    return { status: query.statuses[0] };
  }
  if (query.statuses.length > 1) {
    return { status: { in: query.statuses } };
  }
  if (query.currentOnly) {
    return { status: { in: ['SUBMITTED', 'DISPATCHED', 'INSPECTING'] } };
  }
  return {};
}

function getRequestListOrderBy(
  query: ReturnType<typeof normalizeRequestListQuery>,
) {
  const activeInspectorTaskQuery =
    Boolean(query.inspectorId) &&
    query.statuses.length > 0 &&
    query.statuses.every((status) =>
      ['DISPATCHED', 'INSPECTING'].includes(status),
    );
  if (activeInspectorTaskQuery) {
    return [
      { priority: 'asc' as const },
      { dispatchedAt: 'asc' as const },
      { submittedAt: 'asc' as const },
    ];
  }
  return { submittedAt: 'desc' as const };
}

const requestQueryInclude = {
  dispatcher: { select: { realName: true, username: true } },
  inspection: {
    select: {
      qualifiedQuantity: true,
      result: true,
      unqualifiedQuantity: true,
    },
  },
  inspector: { select: { realName: true, username: true } },
  materialRequest: {
    select: { id: true, requestedName: true, status: true },
  },
  process: { select: { name: true } },
};

const requestQueryIncludeWithWorkOrders = {
  ...requestQueryInclude,
  workOrders: inspectionRequestWorkOrdersInclude,
};

type RequestResponsibilitySource = {
  category?: null | string;
  processName?: null | string;
  responsibilityType?: null | string;
  responsibleDepartment?: null | string;
  responsibleDepartmentId?: null | string;
  supplierId?: null | string;
  supplierName?: null | string;
  team?: null | string;
  teamId?: null | string;
};

async function resolveRequestTeamSuppliers(
  requests: ReadonlyArray<RequestResponsibilitySource>,
) {
  return SupplierIdentityService.resolveSuppliersByTeamIds(
    requests.map((request) => request.teamId),
  );
}

async function findLinkedIssues(
  items: Array<{
    inspectionId: null | string;
    linkedIssueId: null | string;
  }>,
) {
  const linkedIssueIds = items
    .map((item) => item.linkedIssueId)
    .filter(Boolean);
  const inspectionIds = items.map((item) => item.inspectionId).filter(Boolean);

  if (linkedIssueIds.length === 0 && inspectionIds.length === 0) {
    return [];
  }

  return prisma.quality_records.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      inspectionId: true,
      isDeleted: true,
      nonConformanceNumber: true,
      quantity: true,
      status: true,
    },
    where: {
      isDeleted: false,
      OR: [
        ...(linkedIssueIds.length > 0
          ? [{ id: { in: [...new Set(linkedIssueIds)] } }]
          : []),
        ...(inspectionIds.length > 0
          ? [{ inspectionId: { in: [...new Set(inspectionIds)] } }]
          : []),
      ],
    },
  });
}

export const InspectionRequestQueryService = {
  async getRequestDetail(id: string) {
    const findRequest = (includeWorkOrders: boolean) =>
      prisma.qms_inspection_requests.findFirst({
        include: includeWorkOrders
          ? requestQueryIncludeWithWorkOrders
          : requestQueryInclude,
        where: { id, isDeleted: false },
      });
    let request;
    try {
      request = await findRequest(true);
    } catch (error) {
      if (!isPrismaSchemaMismatchError(error)) throw error;
      request = await findRequest(false);
    }
    if (!request) return null;
    const mappedRequest =
      'workOrders' in request ? request : { ...request, workOrders: [] };

    const teamSupplierByTeamId = await resolveRequestTeamSuppliers([
      mappedRequest,
    ]);
    const [issueResponsibility] =
      await resolveInspectionRequestIssueResponsibilities([mappedRequest], {
        teamSupplierByTeamId,
      });

    const issues = await findLinkedIssues([mappedRequest]);
    const issueById = new Map(issues.map((issue) => [issue.id, issue]));
    const issueByInspectionId = new Map(
      issues
        .filter((issue) => issue.inspectionId)
        .map((issue) => [issue.inspectionId, issue]),
    );

    const response = mapInspectionRequest({
      ...mappedRequest,
      qualityRecords: [
        mappedRequest.linkedIssueId
          ? issueById.get(mappedRequest.linkedIssueId)
          : null,
        mappedRequest.inspectionId
          ? issueByInspectionId.get(mappedRequest.inspectionId)
          : null,
      ].filter(Boolean),
    });
    return {
      ...response,
      issueResponsibility,
    };
  },

  async getRequestList(
    userinfo: UserSession,
    rawQuery: Record<string, unknown>,
  ) {
    const query = normalizeRequestListQuery(rawQuery);
    const where = await buildRequestListWhere(userinfo, query);
    const runQuery = (includeWorkOrders: boolean) =>
      Promise.all([
        prisma.qms_inspection_requests.findMany({
          include: includeWorkOrders
            ? requestQueryIncludeWithWorkOrders
            : requestQueryInclude,
          orderBy: getRequestListOrderBy(query),
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          where,
        }),
        prisma.qms_inspection_requests.count({ where }),
      ]);
    let items;
    let total;
    try {
      [items, total] = await runQuery(true);
    } catch (error) {
      if (!isPrismaSchemaMismatchError(error)) throw error;
      const [fallbackItems, fallbackTotal] = await runQuery(false);
      items = fallbackItems.map((item) => ({ ...item, workOrders: [] }));
      total = fallbackTotal;
    }
    const issues = await findLinkedIssues(items);
    const teamSupplierByTeamId = await resolveRequestTeamSuppliers(items);
    const issueResponsibilities =
      await resolveInspectionRequestIssueResponsibilities(items, {
        teamSupplierByTeamId,
      });
    const issueById = new Map(issues.map((issue) => [issue.id, issue]));
    const issueByInspectionId = new Map(
      issues
        .filter((issue) => issue.inspectionId)
        .map((issue) => [issue.inspectionId, issue]),
    );

    return {
      items: items.map((item, index) => {
        const response = mapInspectionRequest({
          ...item,
          qualityRecords: [
            item.linkedIssueId ? issueById.get(item.linkedIssueId) : null,
            item.inspectionId
              ? issueByInspectionId.get(item.inspectionId)
              : null,
          ].filter(Boolean),
        });
        return {
          ...response,
          issueResponsibility: issueResponsibilities[index],
        };
      }),
      total,
    };
  },
};
