import type { UserSession } from '~/utils/jwt-utils';

import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { BusinessError } from '~/utils/business-error';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';
import prisma from '~/utils/prisma';
import {
  resolveCanonicalProcessName,
  resolveProcessIdForWrite,
} from '~/utils/process-resolver';
import {
  resolveTeamIdForWrite,
} from '~/utils/team-resolver';

import { InspectionIssueMutationService } from './inspection-issue-mutation.service';
import { InspectionPublicQueryService } from './inspection-public-query.service';
import {
  generateInspectionRequestNo,
  INSPECTION_REQUEST_STATUS,
  isInspectionRequestAssemblyProcess,
  mapInspectionRequest,
  normalizeInspectionRequestAttachments,
  normalizeInspectionRequestCheckResult,
  normalizeInspectionRequestText,
  parseInspectionRequestPriority,
  parseInspectionRequestQuantity,
  resolveInspectionRequestCurrentUserId,
} from './inspection-request';
import { publishInspectionRequestCreated } from './inspection-request-events';
import { InspectionRequestQueryService } from './inspection-request-query.service';

type RequestBody = Record<string, unknown>;

export const InspectionApiService = {
  async getRequestList(userinfo: UserSession, query: Record<string, unknown>) {
    return InspectionRequestQueryService.getRequestList(userinfo, query);
  },
  async createRequest(
    event: Parameters<typeof recordBusinessAuditLog>[0],
    userinfo: null | UserSession,
    body: RequestBody,
    isPublic = false,
  ) {
    const workOrderNumber = normalizeInspectionRequestText(
      body.workOrderNumber,
    );
    const partName = normalizeInspectionRequestText(body.partName);
    const processName = normalizeInspectionRequestText(body.processName);
    const componentName = isInspectionRequestAssemblyProcess(processName)
      ? ''
      : normalizeInspectionRequestText(body.componentName);
    const reporter = normalizeInspectionRequestText(body.reporter);
    const team = normalizeInspectionRequestText(body.team);
    const quantity = parseInspectionRequestQuantity(body.quantity);
    const attachments = normalizeInspectionRequestAttachments(body.attachments);
    const governedFields = buildGovernedWriteFieldsForTable(
      'qms_inspection_requests',
      { componentName: componentName || null, team },
    );
    const governedCanonicalIds = await buildGovernedCanonicalWritePairForTable(
      'qms_inspection_requests',
      governedFields as Record<string, unknown>,
    );
    const processId = await resolveProcessIdForWrite({ processName });
    const teamId = await resolveTeamIdForWrite({ team });
    const workOrder = await prisma.work_orders.findUnique({
      select: { workOrderNumber: true },
      where: { workOrderNumber },
    });
    if (!workOrder) throw new Error('BAD_REQUEST:工单不存在');
    const created = await prisma.qms_inspection_requests.create({
      data: {
        attachments:
          attachments.length > 0 ? JSON.stringify(attachments) : null,
        componentName: componentName || null,
        mutualCheckResult: normalizeInspectionRequestCheckResult(
          body.mutualCheckResult,
        ),
        partName,
        processId,
        teamId,
        processName,
        quantity,
        reporter,
        requestInfo: normalizeInspectionRequestText(body.requestInfo) || null,
        requestNo: await generateInspectionRequestNo(prisma),
        selfCheckResult: normalizeInspectionRequestCheckResult(
          body.selfCheckResult,
        ),
        ...governedFields,
        ...governedCanonicalIds,
        workOrderNumber,
      },
      include: {
        dispatcher: { select: { realName: true, username: true } },
        inspector: { select: { realName: true, username: true } },
        process: { select: { name: true } },
      },
    });
    await FileStorageService.registerReferencesFromAttachments({
      attachments,
      bizId: created.id,
      bizType: 'inspection_request',
    });
    const mapped = mapInspectionRequest(created);
    if (!isPublic && userinfo) {
      await recordBusinessAuditLog(event, {
        action: 'CREATE',
        detailsTemplate:
          '新增报检任务: {{requestNo}} ({{workOrderNumber}}/{{processName}}/{{partName}})',
        detailsVariables: {
          partName: created.partName,
          processName: resolveCanonicalProcessName(created) || '',
          requestNo: created.requestNo,
          workOrderNumber: created.workOrderNumber,
        },
        targetId: String(created.id),
        targetType: 'inspection_request',
        userId: userinfo.id,
      });
    }
    publishInspectionRequestCreated(mapped);
    return mapped;
  },
  async dispatchRequest(
    event: Parameters<typeof recordBusinessAuditLog>[0],
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
      const taskCreateData = {
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
      };
      const governedTaskFields = buildGovernedWriteFieldsForTable(
        'qms_task_dispatches',
        taskCreateData,
      );
      const task = await tx.qms_task_dispatches.create({
        data: { ...taskCreateData, ...governedTaskFields },
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
    return mapInspectionRequest(updated);
  },
  async deleteRequest(
    event: Parameters<typeof recordBusinessAuditLog>[0],
    id: string,
    userinfo: UserSession,
  ) {
    const existing = await prisma.qms_inspection_requests.findFirst({
      select: { dispatchTaskId: true, id: true, requestNo: true },
      where: { id, isDeleted: false },
    });
    if (!existing) throw new BusinessError('NOT_FOUND', '报检任务不存在', 404);
    await prisma.$transaction(async (tx) => {
      await tx.qms_inspection_requests.update({
        data: { isDeleted: true, updatedAt: new Date() },
        where: { id },
      });
      if (existing.dispatchTaskId)
        await tx.qms_task_dispatches.updateMany({
          data: { status: 'CANCELLED' },
          where: { id: existing.dispatchTaskId },
        });
    });
    await FileStorageService.softDeleteReferences({
      bizId: id,
      bizType: 'inspection_request',
    });
    await recordBusinessAuditLog(event, {
      action: 'DELETE',
      detailsTemplate: '删除报检任务: {{requestNo}}',
      detailsVariables: { requestNo: existing.requestNo },
      targetId: id,
      targetType: 'inspection_request',
      userId: userinfo.id,
    });
  },
  async createIssue(userinfo: UserSession, body: RequestBody) {
    return InspectionIssueMutationService.createIssue(userinfo, body);
  },
  async updateIssue(
    userinfo: UserSession,
    id: string,
    body: RequestBody,
    existingNcNumber: null | string,
  ) {
    return InspectionIssueMutationService.updateIssue(
      userinfo,
      id,
      body,
      existingNcNumber,
    );
  },
  async batchDeleteIssues(
    event: Parameters<typeof recordBusinessAuditLog>[0],
    userinfo: UserSession,
    ids: string[],
  ) {
    return InspectionIssueMutationService.batchDeleteIssues(
      event,
      userinfo,
      ids,
    );
  },
  async importIssues(
    event: Parameters<typeof recordBusinessAuditLog>[0],
    userinfo: UserSession,
    items: Array<Record<string, unknown>>,
  ) {
    return InspectionIssueMutationService.importIssues(event, userinfo, items);
  },
  async getPublicProcesses(workOrderNumber: string) {
    return InspectionPublicQueryService.getPublicProcesses(workOrderNumber);
  },
  async getPublicTeams(keyword: string) {
    return InspectionPublicQueryService.getPublicTeams(keyword);
  },
  async getPublicWorkOrders(query: Record<string, unknown>) {
    return InspectionPublicQueryService.getPublicWorkOrders(query);
  },
};
