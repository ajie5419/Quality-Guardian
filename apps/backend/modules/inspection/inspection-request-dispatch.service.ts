import type { H3Event } from 'h3';
import type { UserSession } from '~/utils/jwt-utils';

import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { UserService } from '~/modules/user';
import { BusinessError } from '~/utils/business-error';
import { buildGovernedWriteFieldsForTable } from '~/utils/governed-write';
import prisma from '~/utils/prisma';
import { notifyWechatWork } from '~/utils/wechat-work-notify';

import {
  INSPECTION_REQUEST_STATUS,
  mapInspectionRequest,
  normalizeInspectionRequestText,
  parseInspectionRequestPriority,
  resolveInspectionRequestCurrentUserId,
} from './inspection-request';

type RequestBody = Record<string, unknown>;

export const InspectionRequestDispatchService = {
  async dispatchRequest(
    event: H3Event,
    id: string,
    body: RequestBody,
    userinfo: UserSession,
  ) {
    const inspectorId = normalizeInspectionRequestText(body.inspectorId);
    const dispatcherId = await resolveInspectionRequestCurrentUserId(
      userinfo,
      prisma,
    );
    if (!inspectorId) throw new Error('BAD_REQUEST:检验员不能为空');
    if (!dispatcherId) throw new Error('BAD_REQUEST:无法识别当前调度人');

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
    if (!request) throw new BusinessError('NOT_FOUND', '报检任务不存在', 404);
    if (request.status === INSPECTION_REQUEST_STATUS.CLOSED)
      throw new Error('BAD_REQUEST:检验完成的报检任务不能重复派单');
    if (!inspector) throw new Error('BAD_REQUEST:检验员不存在');

    const priority = parseInspectionRequestPriority(body.priority);
    const dispatchRemark =
      normalizeInspectionRequestText(body.dispatchRemark) || null;
    const updated = await prisma.$transaction(async (tx) => {
      const task = await tx.qms_task_dispatches.create({
        data: buildDispatchTaskCreateData({
          assignorId: dispatcherId,
          inspectorId: inspector.id,
          priority,
          request,
        }),
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
          process: { select: { name: true } },
        },
        where: { id },
      });
    });

    await recordBusinessAuditLog(event, {
      action: 'UPDATE',
      detailsTemplate: '派发报检任务: {{requestNo}}',
      detailsVariables: { requestNo: updated.requestNo },
      targetId: String(updated.id),
      targetType: 'inspection_request',
      userId: userinfo.id,
    });
    const mapped = mapInspectionRequest(updated);
    void notifyInspector(inspector.id, mapped);
    return mapped;
  },
};

async function notifyInspector(
  inspectorId: string,
  request: {
    id: string;
    partName: string;
    processName: string;
    requestNo: string;
    workOrderNumber: string;
  },
) {
  const inspector = await UserService.findWechatWorkUserById(inspectorId);
  if (!inspector?.wechatWorkId) return;

  await notifyWechatWork(
    inspector.wechatWorkId,
    'Inspection task assigned',
    `${request.requestNo} ${request.workOrderNumber} ${request.processName} ${request.partName}`,
    `https://www.tlqms.com/mobile/inspect/${request.id}`,
  );
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
    status: 'DISPATCHED',
    title: `报检任务 ${options.request.requestNo}`,
    type: 'INSPECTION_REQUEST',
  };
  return {
    ...taskCreateData,
    ...buildGovernedWriteFieldsForTable('qms_task_dispatches', taskCreateData),
  };
}
