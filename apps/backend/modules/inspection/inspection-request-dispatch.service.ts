import type { Prisma } from '@prisma/client';
import type { EventHandlerRequest, H3Event } from 'h3';
import type { UserSession } from '~/utils/jwt-utils';

import { TASK_DISPATCH_STATUS } from '@qgs/shared';
import { z } from 'zod';
import { RbacService } from '~/modules/rbac/rbac.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { UserService, WxSubscribeMessageService } from '~/modules/user';
import { BusinessError } from '~/utils/business-error';
import { buildGovernedWriteFieldsForTable } from '~/utils/governed-write';
import prisma from '~/utils/prisma';

import {
  INSPECTION_REQUEST_STATUS,
  mapInspectionRequest,
  normalizeInspectionRequestText,
  parseInspectionRequestPriority,
  resolveInspectionRequestCurrentUserId,
} from './inspection-request';

type RequestBody = Record<string, unknown>;

const DISPATCH_PERMISSION_CODE = 'QMS:Inspection:Requests:Dispatch';
const DISPATCHABLE_STATUSES = [
  INSPECTION_REQUEST_STATUS.SUBMITTED,
  INSPECTION_REQUEST_STATUS.DISPATCHED,
];
const dispatchRequestSchema = z.object({
  dispatchRemark: z.string().optional(),
  inspectorId: z.string().min(1),
  priority: z.coerce.number().int().min(1).max(5).optional(),
});

export function parseInspectionRequestDispatchBody(input: unknown) {
  const result = dispatchRequestSchema.safeParse(input);
  if (!result.success) {
    throw new BusinessError('BAD_REQUEST', '派单参数无效', 400);
  }
  return result.data;
}

export const InspectionRequestDispatchService = {
  async ensureDispatchPermission(userinfo: UserSession) {
    const userId =
      userinfo.userId ||
      userinfo.id ||
      (await resolveInspectionRequestCurrentUserId(userinfo, prisma));
    const codes = userId
      ? await RbacService.getUserPermissionCodes(String(userId))
      : [];
    if (!codes.includes(DISPATCH_PERMISSION_CODE)) {
      throw new BusinessError('FORBIDDEN', '无派单权限', 403);
    }
  },

  async dispatchRequest(
    event: H3Event<EventHandlerRequest> | null,
    id: string,
    body: RequestBody,
    userinfo: UserSession,
  ) {
    await this.ensureDispatchPermission(userinfo);

    const inspectorId = normalizeInspectionRequestText(body.inspectorId);
    const dispatcherId = await resolveInspectionRequestCurrentUserId(
      userinfo,
      prisma,
    );
    if (!inspectorId)
      throw new BusinessError('BAD_REQUEST', '检验员不能为空', 400);
    if (!dispatcherId)
      throw new BusinessError('BAD_REQUEST', '无法识别当前调度人', 400);

    const [request, inspector] = await Promise.all([
      prisma.qms_inspection_requests.findFirst({
        include: {
          materialRequest: { select: { status: true } },
          work_order: { select: { projectName: true } },
        },
        where: { id, isDeleted: false },
      }),
      UserService.findEligibleInspector(inspectorId),
    ]);
    if (!request) throw new BusinessError('NOT_FOUND', '报检任务不存在', 404);
    if (
      request.status !== INSPECTION_REQUEST_STATUS.SUBMITTED &&
      request.status !== INSPECTION_REQUEST_STATUS.DISPATCHED
    )
      throw new BusinessError(
        'BAD_REQUEST',
        '该报检任务当前状态不可派单或改派，请刷新后重试',
        400,
      );
    if (request.materialRequest?.status === 'PENDING') {
      throw new BusinessError(
        'MATERIAL_APPROVAL_PENDING',
        'The material request is pending approval',
        409,
      );
    }
    if (request.materialRequest?.status === 'REJECTED') {
      throw new BusinessError(
        'MATERIAL_APPROVAL_REJECTED',
        'The material request was rejected',
        409,
      );
    }
    if (!request.partId) {
      throw new BusinessError(
        'MATERIAL_ID_REQUIRED',
        'The inspection request does not have a canonical material identity',
        409,
      );
    }
    if (!inspector) throw new BusinessError('BAD_REQUEST', '检验员不存在', 400);

    const priority = parseInspectionRequestPriority(body.priority);
    const dispatchRemark =
      normalizeInspectionRequestText(body.dispatchRemark) || null;
    const isReassign = request.status === INSPECTION_REQUEST_STATUS.DISPATCHED;
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.qms_inspection_requests.updateMany({
        where: {
          id,
          isDeleted: false,
          status: { in: DISPATCHABLE_STATUSES },
          updatedAt: request.updatedAt,
        },
        data: {
          dispatchedAt: new Date(),
          dispatcherId,
          dispatchRemark,
          inspectorId: inspector.id,
          priority,
          status: INSPECTION_REQUEST_STATUS.DISPATCHED,
        },
      });
      if (result.count === 0)
        throw new BusinessError(
          'BAD_REQUEST',
          '该报检任务状态已变化，请刷新后重试',
          400,
        );
      const dispatchTaskId = await upsertDispatchTask(tx, {
        assignorId: dispatcherId,
        inspectorId: inspector.id,
        priority,
        request,
      });
      return tx.qms_inspection_requests.update({
        data: { dispatchTaskId },
        include: {
          dispatcher: { select: { realName: true, username: true } },
          inspector: { select: { realName: true, username: true } },
          materialRequest: {
            select: { requestedName: true, status: true },
          },
          process: { select: { name: true } },
        },
        where: { id },
      });
    });

    await recordBusinessAuditLog(event, {
      action: 'UPDATE',
      detailsTemplate: isReassign
        ? '改派报检任务: {{requestNo}}'
        : '派发报检任务: {{requestNo}}',
      detailsVariables: { requestNo: updated.requestNo },
      targetId: String(updated.id),
      targetType: 'inspection_request',
      userId: userinfo.id,
    });
    const mapped = mapInspectionRequest(updated);
    void WxSubscribeMessageService.sendDispatchAssigned({
      dispatcher:
        updated.dispatcher?.realName || updated.dispatcher?.username || '系统',
      openid: inspector.wxOpenId,
      partName: mapped.partName,
      projectName: request.work_order?.projectName || mapped.workOrderNumber,
      requestNo: mapped.requestNo,
      workOrderNumber: mapped.workOrderNumber,
    });
    return mapped;
  },
};

async function upsertDispatchTask(
  tx: Prisma.TransactionClient,
  options: {
    assignorId: string;
    inspectorId: string;
    priority: number;
    request: {
      dispatchTaskId?: null | string;
      id: string;
      requestNo: string;
      workOrderNumber: string;
    };
  },
) {
  const data = buildDispatchTaskUpdateData(options);
  if (!options.request.dispatchTaskId) {
    const task = await tx.qms_task_dispatches.create({
      data: buildDispatchTaskCreateData(options),
    });
    return task.id;
  }

  const updated = await tx.qms_task_dispatches.updateMany({
    data,
    where: {
      id: options.request.dispatchTaskId,
      status: TASK_DISPATCH_STATUS.DISPATCHED,
    },
  });
  if (updated.count === 0) {
    throw new BusinessError(
      'BAD_REQUEST',
      '关联派单任务已开始处理，不能改派',
      400,
    );
  }
  return options.request.dispatchTaskId;
}

function buildDispatchTaskUpdateData(options: {
  assignorId: string;
  inspectorId: string;
  priority: number;
  request: { id: string; requestNo: string; workOrderNumber: string };
}) {
  return {
    assigneeId: options.inspectorId,
    assignorId: options.assignorId,
    content: JSON.stringify({
      inspectionRequestId: options.request.id,
      requestNo: options.request.requestNo,
      workOrderNumber: options.request.workOrderNumber,
    }),
    priority: options.priority,
    status: TASK_DISPATCH_STATUS.DISPATCHED,
    title: `报检任务 ${options.request.requestNo}`,
  };
}

function buildDispatchTaskCreateData(options: {
  assignorId: string;
  inspectorId: string;
  priority: number;
  request: { id: string; requestNo: string; workOrderNumber: string };
}) {
  const taskCreateData = {
    assigneeId: options.inspectorId,
    assignorId: options.assignorId,
    content: JSON.stringify({
      inspectionRequestId: options.request.id,
      requestNo: options.request.requestNo,
      workOrderNumber: options.request.workOrderNumber,
    }),
    priority: options.priority,
    status: TASK_DISPATCH_STATUS.DISPATCHED,
    title: `报检任务 ${options.request.requestNo}`,
    type: 'INSPECTION_REQUEST',
  };
  return {
    ...taskCreateData,
    ...buildGovernedWriteFieldsForTable('qms_task_dispatches', taskCreateData),
  };
}
