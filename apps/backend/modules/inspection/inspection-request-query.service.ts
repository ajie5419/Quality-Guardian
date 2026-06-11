import type { UserSession } from '~/utils/jwt-utils';

import prisma from '~/utils/prisma';
import { buildTeamContainsWhere } from '~/utils/team-resolver';

import {
  mapInspectionRequest,
  normalizeInspectionRequestStatus,
  normalizeInspectionRequestText,
  resolveInspectionRequestCurrentUserId,
} from './inspection-request';
import { inspectionRequestWorkOrdersInclude } from './inspection-request-work-orders';

function normalizeRequestListQuery(query: Record<string, unknown>) {
  return {
    currentOnly: String(query.current || '') === 'true',
    includeClosed: String(query.includeClosed || '') === 'true',
    keyword: normalizeInspectionRequestText(query.keyword),
    mine: String(query.mine || '') === 'true',
    page: Math.max(Number(query.page || 1), 1),
    pageSize: Math.min(Math.max(Number(query.pageSize || 20), 1), 100),
    processName: normalizeInspectionRequestText(query.processName),
    status: normalizeInspectionRequestStatus(query.status),
    team: normalizeInspectionRequestText(query.team),
    workOrderNumber: normalizeInspectionRequestText(query.workOrderNumber),
  };
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
    ...statusWhere,
    ...(query.workOrderNumber
      ? { workOrderNumber: query.workOrderNumber }
      : {}),
    ...(query.processName ? { processName: query.processName } : {}),
    ...(query.team
      ? await buildTeamContainsWhere({ keyword: query.team })
      : {}),
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
            await buildTeamContainsWhere({ keyword: query.keyword }),
          ],
        }
      : {}),
  };
}

function getRequestListStatusWhere(
  query: ReturnType<typeof normalizeRequestListQuery>,
): Record<string, unknown> {
  if (query.mine && query.includeClosed) {
    return { status: { in: ['DISPATCHED', 'INSPECTING', 'CLOSED'] } };
  }
  if (query.status) {
    return { status: query.status };
  }
  if (query.currentOnly) {
    return { status: { in: ['SUBMITTED', 'DISPATCHED', 'INSPECTING'] } };
  }
  return {};
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
    const request = await prisma.qms_inspection_requests.findFirst({
      include: {
        dispatcher: { select: { realName: true, username: true } },
        inspection: {
          select: {
            qualifiedQuantity: true,
            result: true,
            unqualifiedQuantity: true,
          },
        },
        inspector: { select: { realName: true, username: true } },
        process: { select: { name: true } },
        workOrders: inspectionRequestWorkOrdersInclude,
      },
      where: { id, isDeleted: false },
    });
    if (!request) return null;

    const issues = await findLinkedIssues([request]);
    const issueById = new Map(issues.map((issue) => [issue.id, issue]));
    const issueByInspectionId = new Map(
      issues
        .filter((issue) => issue.inspectionId)
        .map((issue) => [issue.inspectionId, issue]),
    );

    return mapInspectionRequest({
      ...request,
      qualityRecords: [
        request.linkedIssueId ? issueById.get(request.linkedIssueId) : null,
        request.inspectionId
          ? issueByInspectionId.get(request.inspectionId)
          : null,
      ].filter(Boolean),
    });
  },

  async getRequestList(
    userinfo: UserSession,
    rawQuery: Record<string, unknown>,
  ) {
    const query = normalizeRequestListQuery(rawQuery);
    const where = await buildRequestListWhere(userinfo, query);
    const [items, total] = await Promise.all([
      prisma.qms_inspection_requests.findMany({
        include: {
          dispatcher: { select: { realName: true, username: true } },
          inspection: {
            select: {
              qualifiedQuantity: true,
              result: true,
              unqualifiedQuantity: true,
            },
          },
          inspector: { select: { realName: true, username: true } },
          process: { select: { name: true } },
          workOrders: inspectionRequestWorkOrdersInclude,
        },
        orderBy: { submittedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
      prisma.qms_inspection_requests.count({ where }),
    ]);
    const issues = await findLinkedIssues(items);
    const issueById = new Map(issues.map((issue) => [issue.id, issue]));
    const issueByInspectionId = new Map(
      issues
        .filter((issue) => issue.inspectionId)
        .map((issue) => [issue.inspectionId, issue]),
    );

    return {
      items: items.map((item) =>
        mapInspectionRequest({
          ...item,
          qualityRecords: [
            item.linkedIssueId ? issueById.get(item.linkedIssueId) : null,
            item.inspectionId
              ? issueByInspectionId.get(item.inspectionId)
              : null,
          ].filter(Boolean),
        }),
      ),
      total,
    };
  },
};
