import type { Prisma } from '@prisma/client';

import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import {
  buildInspectionRecordFromRequest,
  INSPECTION_REQUEST_STATUS,
  mapInspectionRequest,
  normalizeInspectionRequestAttachments,
  normalizeInspectionRequestText,
  parseInspectionRequestQuantity,
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

function parseCloseRequestNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requireLinkedIssueText(
  linkedIssue: Record<string, unknown>,
  key: string,
  label: string,
) {
  if (!normalizeInspectionRequestText(linkedIssue[key])) {
    throw new Error(`VALIDATION:不合格项${label}不能为空`);
  }
}

function validateCloseRequestBody(body: Record<string, unknown>) {
  const result = normalizeInspectionRequestText(body.result).toUpperCase();
  if (result !== 'PASS' && result !== 'FAIL') {
    throw new Error('VALIDATION:检验结果必须为合格或不合格');
  }

  const closeAttachments = normalizeInspectionRequestAttachments(
    body.attachments,
  );
  if (closeAttachments.length === 0) {
    throw new Error('VALIDATION:关闭附件不能为空');
  }

  const quantity = parseInspectionRequestQuantity(body.quantity);
  const rawUnqualifiedQuantity = parseCloseRequestNumber(
    body.unqualifiedQuantity,
    result === 'FAIL' ? quantity : 0,
  );
  const unqualifiedQuantity = Math.max(
    0,
    Math.min(quantity, rawUnqualifiedQuantity),
  );

  if (result === 'PASS' && unqualifiedQuantity > 0) {
    throw new Error('VALIDATION:检验结果为合格时，不合格数量必须为 0');
  }

  if (result !== 'FAIL') return;

  if (unqualifiedQuantity <= 0) {
    throw new Error('VALIDATION:检验结果为不合格时，不合格数量必须大于 0');
  }

  if (!body.linkedIssue || typeof body.linkedIssue !== 'object') {
    throw new Error('VALIDATION:检验结果为不合格时必须填写不合格项信息');
  }

  const linkedIssue = body.linkedIssue as Record<string, unknown>;
  for (const [key, label] of [
    ['partName', '部件名称'],
    ['processName', '工序'],
    ['responsibleDepartment', '责任部门'],
    ['defectType', '缺陷分类'],
    ['defectSubtype', '二级分类'],
    ['severity', '严重程度'],
    ['status', '状态'],
    ['description', '不合格描述'],
    ['rootCause', '原因分析'],
    ['solution', '解决方案'],
  ] as const) {
    requireLinkedIssueText(linkedIssue, key, label);
  }
}

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
  try {
    validateCloseRequestBody(body);
  } catch (error) {
    if (
      error instanceof Error &&
      String(error.message || '').startsWith('VALIDATION:')
    ) {
      return badRequestResponse(
        event,
        String(error.message || '').replace('VALIDATION:', ''),
      );
    }
    throw error;
  }

  const explicitInspectionId = normalizeInspectionRequestText(
    body.inspectionId,
  );

  try {
    const request = await prisma.qms_inspection_requests.findFirst({
      include: { work_order: { select: { projectName: true } } },
      where: { id, isDeleted: false },
    });

    if (!request) {
      return notFoundResponse(event, '报检任务不存在');
    }
    if (request.status === INSPECTION_REQUEST_STATUS.CLOSED) {
      return badRequestResponse(event, '报检任务已检验完成');
    }

    let inspectionId = explicitInspectionId;
    if (inspectionId) {
      const inspection = await prisma.inspections.findFirst({
        select: { id: true, workOrderNumber: true },
        where: {
          id: inspectionId,
          isDeleted: false,
          workOrderNumber: request.workOrderNumber,
        },
      });
      if (!inspection) {
        return badRequestResponse(
          event,
          '关联的检验记录不存在，或工单号与报检任务不一致',
        );
      }
    } else {
      const inspection = await buildInspectionRecordFromRequest(request, body);
      inspectionId = String(inspection.id);
    }

    // 处理关闭时上传的附件
    const closeAttachments = normalizeInspectionRequestAttachments(
      body.attachments,
    );

    const result = normalizeInspectionRequestText(body.result).toUpperCase();
    const linkedIssue = body.linkedIssue as Record<string, unknown> | undefined;
    let issueCreateData: Prisma.quality_recordsCreateInput | undefined;
    let issueAuditDetails = '';

    if (result === 'FAIL' && linkedIssue && inspectionId) {
      const issueUtils = await import('~/utils/inspection-issue');
      const {
        createInspectionIssueId,
        findInspectionForIssue,
        getNextInspectionIssueSerialNumber,
      } = issueUtils;

      const linkedInspection = await findInspectionForIssue(inspectionId);
      const newId = createInspectionIssueId();
      const serialNumber = await getNextInspectionIssueSerialNumber();
      const issueQuantity = Math.max(
        1,
        Math.trunc(
          parseCloseRequestNumber(
            linkedIssue.quantity,
            parseCloseRequestNumber(body.unqualifiedQuantity, 1),
          ),
        ),
      );

      const issueBody = {
        claim: normalizeInspectionRequestText(linkedIssue.claim) || 'No',
        defectSubtype: normalizeInspectionRequestText(
          linkedIssue.defectSubtype,
        ),
        defectType:
          normalizeInspectionRequestText(linkedIssue.defectType) || '制造缺陷',
        description: normalizeInspectionRequestText(linkedIssue.description),
        inspectionId,
        lossAmount: Number(linkedIssue.lossAmount || 0),
        partName:
          normalizeInspectionRequestText(linkedIssue.partName) ||
          request.partName,
        processName:
          normalizeInspectionRequestText(linkedIssue.processName) ||
          request.processName,
        projectName: request.work_order?.projectName || request.workOrderNumber,
        quantity: issueQuantity,
        reportDate: normalizeInspectionRequestText(linkedIssue.reportDate),
        reportedBy:
          normalizeInspectionRequestText(linkedIssue.reportedBy) ||
          request.reporter,
        responsibleDepartment:
          normalizeInspectionRequestText(linkedIssue.responsibleDepartment) ||
          request.team ||
          '质量部',
        responsibleWelder:
          normalizeInspectionRequestText(linkedIssue.responsibleWelder) ||
          undefined,
        rootCause: normalizeInspectionRequestText(linkedIssue.rootCause),
        severity:
          normalizeInspectionRequestText(linkedIssue.severity) || 'Minor',
        solution: normalizeInspectionRequestText(linkedIssue.solution),
        status: normalizeInspectionRequestText(linkedIssue.status) || 'OPEN',
        supplierName: normalizeInspectionRequestText(linkedIssue.supplierName),
        sourceType: 'INSPECTION_REQUEST',
        photos: Array.isArray(linkedIssue.photos) ? linkedIssue.photos : [],
        workOrderNumber: request.workOrderNumber,
      };

      issueCreateData = issueUtils.buildInspectionIssueCreateData(issueBody, {
        id: newId,
        inspection: linkedInspection,
        inspectorUsername: userinfo.username,
        serialNumber,
      });
      issueAuditDetails = `新增检验问题: ${issueBody.partName} (${newId})`;
    }

    const { record: updated, issue } = await prisma.$transaction(async (tx) => {
      const issueRecord = issueCreateData
        ? await tx.quality_records.create({ data: issueCreateData })
        : null;

      const record = await tx.qms_inspection_requests.update({
        data: {
          closeAttachments:
            closeAttachments.length > 0
              ? JSON.stringify(closeAttachments)
              : null,
          closeRemark: normalizeInspectionRequestText(body.closeRemark) || null,
          closedAt: new Date(),
          inspectionId,
          status: INSPECTION_REQUEST_STATUS.CLOSED,
        },
        include: {
          dispatcher: { select: { realName: true, username: true } },
          inspector: { select: { realName: true, username: true } },
        },
        where: { id },
      });

      if (record.dispatchTaskId) {
        await tx.qms_task_dispatches.updateMany({
          data: { status: 'COMPLETED' },
          where: { id: record.dispatchTaskId },
        });
      }

      return { issue: issueRecord, record };
    });

    if (issue) {
      const { SystemLogService } = await import(
        '~/services/system-log.service'
      );
      const { WelderScoreService } = await import(
        '~/services/welder-score.service'
      );

      await SystemLogService.recordAuditLog({
        userId: String(userinfo.id),
        action: 'CREATE',
        targetType: 'inspection_issue',
        targetId: String(issue.id),
        details:
          issueAuditDetails ||
          `新增检验问题: ${issue.partName} (${issue.nonConformanceNumber || '无编号'})`,
      });
      await WelderScoreService.syncFromInspectionIssues();
    }

    await recordBusinessAuditLog(event, {
      action: 'UPDATE',
      details: `关闭报检任务: ${updated.requestNo}，关联检验记录: ${inspectionId}`,
      targetId: String(updated.id),
      targetType: 'inspection_request',
      userId: userinfo?.id,
    });

    return useResponseSuccess(mapInspectionRequest(updated));
  } catch (error) {
    logApiError('inspection-request-close', error);
    if (
      error instanceof Error &&
      String(error.message || '').startsWith('VALIDATION:')
    ) {
      return badRequestResponse(
        event,
        String(error.message || '').replace('VALIDATION:', ''),
      );
    }
    return internalServerErrorResponse(event, '关闭报检任务失败');
  }
});
