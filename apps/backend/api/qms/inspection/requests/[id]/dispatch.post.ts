import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import {
  INSPECTION_REQUEST_STATUS,
  mapInspectionRequest,
  normalizeInspectionRequestText,
  parseInspectionRequestPriority,
  resolveInspectionRequestCurrentUserId,
} from '~/utils/inspection-request';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  badRequestResponse,
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') {
    return id;
  }

  const body = (await readBody(event)) as Record<string, unknown>;
  const inspectorId = normalizeInspectionRequestText(body.inspectorId);
  if (!inspectorId) {
    return badRequestResponse(event, '检验员不能为空');
  }

  const dispatcherId = await resolveInspectionRequestCurrentUserId(
    userinfo,
    prisma,
  );
  if (!dispatcherId) {
    return badRequestResponse(event, '无法识别当前调度人');
  }

  try {
    const [request, inspector] = await Promise.all([
      prisma.qms_inspection_requests.findFirst({
        include: { work_order: { select: { projectName: true } } },
        where: { id, isDeleted: false },
      }),
      prisma.users.findFirst({
        select: { id: true },
        where: { OR: [{ id: inspectorId }, { username: inspectorId }] },
      }),
    ]);

    if (!request) {
      return notFoundResponse(event, '报检任务不存在');
    }
    if (request.status === INSPECTION_REQUEST_STATUS.CLOSED) {
      return badRequestResponse(event, '检验完成的报检任务不能重复派单');
    }
    if (!inspector) {
      return badRequestResponse(event, '检验员不存在');
    }

    const priority = parseInspectionRequestPriority(body.priority);
    const dispatchRemark =
      normalizeInspectionRequestText(body.dispatchRemark) || null;

    const updated = await prisma.$transaction(async (tx) => {
      const task = await tx.qms_task_dispatches.create({
        data: {
          assigneeId: inspector.id,
          assignorId: dispatcherId,
          content: JSON.stringify({
            inspectionRequestId: request.id,
            requestNo: request.requestNo,
            workOrderNumber: request.workOrderNumber,
          }),
          priority,
          status: 'DISPATCHED',
          title: `报检任务 ${request.requestNo}`,
          type: 'INSPECTION_REQUEST',
        },
      });

      return tx.qms_inspection_requests.update({
        data: {
          dispatchedAt: new Date(),
          dispatcherId,
          dispatchRemark,
          dispatchTaskId: task.id,
          inspectorId: inspector.id,
          priority,
          status: INSPECTION_REQUEST_STATUS.DISPATCHED,
        },
        include: {
          dispatcher: { select: { realName: true, username: true } },
          inspector: { select: { realName: true, username: true } },
        },
        where: { id },
      });
    });

    await recordBusinessAuditLog(event, {
      action: 'UPDATE',
      details: `派发报检任务: ${updated.requestNo}`,
      targetId: String(updated.id),
      targetType: 'inspection_request',
      userId: userinfo?.id,
    });

    return useResponseSuccess(mapInspectionRequest(updated));
  } catch (error) {
    logApiError('inspection-request-dispatch', error);
    return internalServerErrorResponse(event, '报检派单失败');
  }
});
