import type { UserSession } from '~/utils/jwt-utils';

import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { WelderScoreService } from '~/modules/welder-score/welder-score.service';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import {
  buildImportRowError,
  buildImportSummary,
  inferImportErrorField,
  toImportErrorMessage,
} from '~/utils/import-report';
import {
  buildInspectionIssueCreateData,
  buildInspectionIssueUpdateData,
  buildInspectionIssueUpsertPayload,
  createInspectionIssueId,
  findInspectionForIssue,
  getNextInspectionIssueSerialNumber,
} from '~/utils/inspection-issue';
import {
  generateInspectionRequestNo,
  INSPECTION_REQUEST_STATUS,
  isInspectionRequestAssemblyProcess,
  mapInspectionRequest,
  normalizeInspectionRequestAttachments,
  normalizeInspectionRequestCheckResult,
  normalizeInspectionRequestStatus,
  normalizeInspectionRequestText,
  parseInspectionRequestPriority,
  parseInspectionRequestQuantity,
  resolveInspectionRequestCurrentUserId,
} from '~/utils/inspection-request';
import { publishInspectionRequestCreated } from '~/utils/inspection-request-events';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/master-data-governance-write';
import prisma from '~/utils/prisma';
import {
  resolveCanonicalProcessName,
  resolveProcessIdForWrite,
} from '~/utils/process-resolver';
import { OUTSOURCING_CATEGORY } from '~/utils/supplier';
import {
  buildTeamContainsWhere,
  resolveTeamIdForWrite,
} from '~/utils/team-resolver';
import { parseWorkOrderListQuery } from '~/utils/work-order';

type RequestBody = Record<string, unknown>;

type DeptRow = { id: string; name: string; parentId: string };

function collectLeafDepartments(rows: DeptRow[]) {
  const childrenMap = new Map<string, DeptRow[]>();
  for (const row of rows)
    childrenMap.set(row.parentId, [
      ...(childrenMap.get(row.parentId) || []),
      row,
    ]);
  const result: DeptRow[] = [];
  const walk = (row: DeptRow) => {
    const children = childrenMap.get(row.id) || [];
    if (children.length === 0) return void result.push(row);
    for (const child of children) walk(child);
  };
  const productionRoots = rows.filter(
    (row) => row.name.includes('生产') || row.name.includes('制造'),
  );
  if (productionRoots.length > 0) {
    for (const root of productionRoots) walk(root);
    return result;
  }
  return rows.filter((row) => (childrenMap.get(row.id) || []).length === 0);
}

export const InspectionApiService = {
  async getRequestList(userinfo: UserSession, query: Record<string, unknown>) {
    const keyword = normalizeInspectionRequestText(query.keyword);
    const currentOnly = String(query.current || '') === 'true';
    const includeClosed = String(query.includeClosed || '') === 'true';
    const mine = String(query.mine || '') === 'true';
    const status = normalizeInspectionRequestStatus(query.status);
    const workOrderNumber = normalizeInspectionRequestText(
      query.workOrderNumber,
    );
    const team = normalizeInspectionRequestText(query.team);
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 20), 1), 100);
    const currentUserId = mine
      ? await resolveInspectionRequestCurrentUserId(userinfo, prisma)
      : null;
    let statusWhere: Record<string, unknown> = {};
    if (mine && includeClosed) {
      statusWhere = { status: { in: ['DISPATCHED', 'INSPECTING', 'CLOSED'] } };
    } else if (status) {
      statusWhere = { status };
    } else if (currentOnly) {
      statusWhere = {
        status: { in: ['SUBMITTED', 'DISPATCHED', 'INSPECTING'] },
      };
    }
    const where: Record<string, unknown> = {
      isDeleted: false,
      ...(mine && currentUserId ? { inspectorId: currentUserId } : {}),
      ...statusWhere,
      ...(workOrderNumber ? { workOrderNumber } : {}),
      ...(team ? await buildTeamContainsWhere({ keyword: team }) : {}),
      ...(keyword
        ? {
            OR: [
              { requestNo: { contains: keyword } },
              { id: { contains: keyword } },
              { workOrderNumber: { contains: keyword } },
              { partName: { contains: keyword } },
              { componentName: { contains: keyword } },
              { processName: { contains: keyword } },
              { process: { is: { name: { contains: keyword } } } },
              { reporter: { contains: keyword } },
              await buildTeamContainsWhere({ keyword }),
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
          process: { select: { name: true } },
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
    if (!request) throw new Error('NOT_FOUND:报检任务不存在');
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
    if (!existing) throw new Error('NOT_FOUND:报检任务不存在');
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
    const sourceType = String(body.sourceType || '')
      .trim()
      .toUpperCase();
    if (
      (sourceType === 'INSPECTION' || sourceType === 'INSPECTION_RECORD') &&
      !String(body.inspectionId || '').trim()
    ) {
      throw new Error(
        'BAD_REQUEST:检验记录来源创建不合格项时必须携带 inspectionId',
      );
    }
    const linkedInspection = await findInspectionForIssue(
      body.inspectionId as string | undefined,
    );
    const newId = createInspectionIssueId();
    const serialNumber = await getNextInspectionIssueSerialNumber();
    const newRecord = await prisma.quality_records.create({
      data: await buildInspectionIssueCreateData(body, {
        id: newId,
        inspection: linkedInspection,
        inspectorUsername: userinfo.username,
        serialNumber,
      }),
    });
    await FileStorageService.registerReferencesFromAttachments({
      attachments: body.photos,
      bizId: String(newRecord.id),
      bizType: 'inspection_issue',
      fieldName: 'photos',
    });
    await SystemLogService.recordAuditLog({
      userId: String(userinfo.id),
      action: 'CREATE',
      targetType: 'inspection_issue',
      targetId: String(newRecord.id),
      detailsTemplate: '新增检验问题: {{partName}} ({{nonConformanceNumber}})',
      detailsVariables: {
        nonConformanceNumber: newRecord.nonConformanceNumber || '无编号',
        partName: newRecord.partName,
      },
    });
    await WelderScoreService.syncFromInspectionIssues();
    return { ...newRecord, ncNumber: newRecord.nonConformanceNumber };
  },
  async updateIssue(
    userinfo: UserSession,
    id: string,
    body: RequestBody,
    existingNcNumber: null | string,
  ) {
    const updateData = await buildInspectionIssueUpdateData(
      body,
      existingNcNumber,
    );
    await prisma.quality_records.update({ where: { id }, data: updateData });
    if (body.photos !== undefined) {
      await FileStorageService.registerReferencesFromAttachments({
        attachments: body.photos,
        bizId: String(id),
        bizType: 'inspection_issue',
        fieldName: 'photos',
      });
    }
    await SystemLogService.recordAuditLog({
      userId: String(userinfo.id),
      action: 'UPDATE',
      targetType: 'inspection_issue',
      targetId: String(id),
      detailsTemplate: '修改检验问题: {{partName}} ({{nonConformanceNumber}})',
      detailsVariables: {
        nonConformanceNumber:
          updateData.nonConformanceNumber || existingNcNumber || '无编号',
        partName: updateData.partName || '未修改名称',
      },
    });
    await WelderScoreService.syncFromInspectionIssues();
  },
  async batchDeleteIssues(
    event: Parameters<typeof recordBusinessAuditLog>[0],
    userinfo: UserSession,
    ids: string[],
  ) {
    const result = await prisma.quality_records.updateMany({
      where: { id: { in: ids } },
      data: { isDeleted: true, updatedAt: new Date() },
    });
    if (result.count > 0) await WelderScoreService.syncFromInspectionIssues();
    await Promise.all(
      ids.map((id) =>
        FileStorageService.softDeleteReferences({
          bizId: id,
          bizType: 'inspection_issue',
        }),
      ),
    );
    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'DELETE',
      targetType: 'inspection_issue',
      targetId: ids.join(','),
      detailsTemplate: '批量删除不合格品项: {{count}} 条',
      detailsVariables: { count: result.count },
    });
    return result.count;
  },
  async importIssues(
    event: Parameters<typeof recordBusinessAuditLog>[0],
    userinfo: UserSession,
    items: Array<Record<string, unknown>>,
  ) {
    let successCount = 0;
    const rowErrors = [];
    let serialSeed = await getNextInspectionIssueSerialNumber();
    for (const [index, item] of items.entries()) {
      try {
        const payload = await buildInspectionIssueUpsertPayload(
          item,
          serialSeed,
        );
        if (!payload) {
          rowErrors.push(
            buildImportRowError({
              field: 'workOrderNumber',
              item,
              keyField: 'ncNumber',
              reason: '缺少有效的工单号',
              row: index + 1,
              suggestion: '请填写可关联的工单号',
            }),
          );
          continue;
        }
        serialSeed++;
        await prisma.quality_records.upsert(payload);
        successCount++;
      } catch (error) {
        const message = toImportErrorMessage(error);
        rowErrors.push(
          buildImportRowError({
            field: inferImportErrorField(message),
            item,
            keyField: 'ncNumber',
            reason: message,
            row: index + 1,
          }),
        );
      }
    }
    if (successCount > 0) await WelderScoreService.syncFromInspectionIssues();
    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'CREATE',
      targetType: 'inspection_issue',
      targetId: 'batch-import',
      detailsTemplate: '导入不合格品项: {{successCount}}/{{totalCount}} 条',
      detailsVariables: { successCount, totalCount: items.length },
    });
    return buildImportSummary({
      rowErrors,
      successCount,
      totalCount: items.length,
    });
  },
  async getPublicProcesses(workOrderNumber: string) {
    const list = await prisma.work_order_requirements.findMany({
      where: { isDeleted: false, status: 'active', workOrderNumber },
      orderBy: [{ updatedAt: 'desc' }],
      select: { process: { select: { name: true } }, processName: true },
    });
    return [
      ...new Set(
        list.map((item) => resolveCanonicalProcessName(item)).filter(Boolean),
      ),
    ].map((processName) => ({ processName }));
  },
  async getPublicTeams(keyword: string) {
    const [departments, suppliers] = await Promise.all([
      prisma.departments.findMany({
        where: { isDeleted: false, status: 1 },
        orderBy: { sort: 'asc' },
        select: { id: true, name: true, parentId: true },
      }),
      prisma.suppliers.findMany({
        where: {
          category: OUTSOURCING_CATEGORY,
          isDeleted: false,
          ...(keyword ? { name: { contains: keyword } } : {}),
        },
        orderBy: { name: 'asc' },
        take: 100,
        select: { name: true },
      }),
    ]);
    const internalTeams = collectLeafDepartments(departments)
      .filter((item) => !keyword || item.name.includes(keyword))
      .map((item) => ({
        group: 'internal' as const,
        label: item.name,
        value: item.name,
      }));
    const externalTeams = suppliers.map((item) => ({
      group: 'external' as const,
      label: item.name,
      value: item.name,
    }));
    return [...internalTeams, ...externalTeams];
  },
  async getPublicWorkOrders(query: Record<string, unknown>) {
    const params = parseWorkOrderListQuery({
      ...query,
      ignoreYearFilter: true,
      pageSize: query.pageSize || 20,
    });
    const where: Record<string, unknown> = { isDeleted: false };
    if (params.keyword) {
      where.OR = [
        { workOrderNumber: { contains: params.keyword } },
        { projectName: { contains: params.keyword } },
      ];
    } else if (params.workOrderNumber) {
      where.workOrderNumber = { contains: params.workOrderNumber };
    }
    const [items, total] = await Promise.all([
      prisma.work_orders.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: {
          projectName: true,
          quantity: true,
          status: true,
          workOrderNumber: true,
        },
      }),
      prisma.work_orders.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        createTime: null,
        customerName: null,
        deliveryDate: null,
        id: item.workOrderNumber,
        projectName: item.projectName || null,
        quantity: item.quantity || 0,
        status: item.status,
        workOrderNumber: item.workOrderNumber,
      })),
      total,
    };
  },
};
