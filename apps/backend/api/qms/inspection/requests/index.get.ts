import { defineEventHandler, getQuery } from 'h3';
import { logApiError } from '~/utils/api-logger';
import {
  mapInspectionRequest,
  normalizeInspectionRequestStatus,
  normalizeInspectionRequestText,
  resolveInspectionRequestCurrentUserId,
} from '~/utils/inspection-request';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const query = getQuery(event);
  const keyword = normalizeInspectionRequestText(query.keyword);
  const currentOnly = String(query.current || '') === 'true';
  const includeClosed = String(query.includeClosed || '') === 'true';
  const mine = String(query.mine || '') === 'true';
  const status = normalizeInspectionRequestStatus(query.status);
  const workOrderNumber = normalizeInspectionRequestText(query.workOrderNumber);
  const page = Math.max(Number(query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(query.pageSize || 20), 1), 100);

  try {
    const currentUserId = mine
      ? await resolveInspectionRequestCurrentUserId(userinfo, prisma)
      : null;
    let statusWhere = {};
    if (mine && includeClosed) {
      statusWhere = { status: { in: ['DISPATCHED', 'INSPECTING', 'CLOSED'] } };
    } else if (status) {
      statusWhere = { status };
    } else if (currentOnly) {
      statusWhere = {
        status: { in: ['SUBMITTED', 'DISPATCHED', 'INSPECTING'] },
      };
    }
    const where: any = {
      isDeleted: false,
      ...(mine && currentUserId ? { inspectorId: currentUserId } : {}),
      ...statusWhere,
      ...(workOrderNumber ? { workOrderNumber } : {}),
      ...(keyword
        ? {
            OR: [
              { requestNo: { contains: keyword } },
              { id: { contains: keyword } },
              { workOrderNumber: { contains: keyword } },
              { partName: { contains: keyword } },
              { componentName: { contains: keyword } },
              { processName: { contains: keyword } },
              { reporter: { contains: keyword } },
              { team: { contains: keyword } },
            ],
          }
        : {}),
    };

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
        },
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        where,
      }),
      prisma.qms_inspection_requests.count({ where }),
    ]);
    const linkedIssueIds = items
      .map((item) => item.linkedIssueId)
      .filter(Boolean) as string[];
    const inspectionIds = items
      .map((item) => item.inspectionId)
      .filter(Boolean) as string[];
    const issues =
      linkedIssueIds.length > 0 || inspectionIds.length > 0
        ? await prisma.quality_records.findMany({
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
          })
        : [];
    const issueById = new Map(issues.map((issue) => [issue.id, issue]));
    const issueByInspectionId = new Map(
      issues
        .filter((issue) => issue.inspectionId)
        .map((issue) => [issue.inspectionId, issue]),
    );

    return useResponseSuccess({
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
    });
  } catch (error) {
    logApiError('inspection-request-list', error);
    return internalServerErrorResponse(event, '获取报检任务失败');
  }
});
