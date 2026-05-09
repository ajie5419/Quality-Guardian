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
  const mine = String(query.mine || '') === 'true';
  const status = normalizeInspectionRequestStatus(query.status);
  const workOrderNumber = normalizeInspectionRequestText(query.workOrderNumber);
  const page = Math.max(Number(query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(query.pageSize || 20), 1), 100);

  try {
    const currentUserId = mine
      ? await resolveInspectionRequestCurrentUserId(userinfo, prisma)
      : null;
    const where: any = {
      isDeleted: false,
      ...(mine && currentUserId ? { inspectorId: currentUserId } : {}),
      ...(status ? { status } : {}),
      ...(workOrderNumber ? { workOrderNumber } : {}),
      ...(keyword
        ? {
            OR: [
              { requestNo: { contains: keyword } },
              { id: { contains: keyword } },
              { workOrderNumber: { contains: keyword } },
              { partName: { contains: keyword } },
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
          inspector: { select: { realName: true, username: true } },
        },
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        where,
      }),
      prisma.qms_inspection_requests.count({ where }),
    ]);

    return useResponseSuccess({
      items: items.map((item) => mapInspectionRequest(item)),
      total,
    });
  } catch (error) {
    logApiError('inspection-request-list', error);
    return internalServerErrorResponse(event, '获取报检任务失败');
  }
});
