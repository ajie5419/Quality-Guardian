import type { Prisma } from '@prisma/client';

import process from 'node:process';

import { defineEventHandler, readBody } from 'h3';
import { FileStorageService } from '~/services/file-storage.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import {
  buildInspectionRecordFromRequest,
  INSPECTION_REQUEST_STATUS,
  mapInspectionRequest,
  mergeInspectionRequestAttachments,
  normalizeInspectionRequestAttachments,
  normalizeInspectionRequestText,
  parseInspectionRequestQuantity,
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
    throw new Error('VALIDATION:检验记录不能为空');
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
    ['partName', '组件名称'],
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

function stringifyCloseInspectionDocuments(
  attachments: ReturnType<typeof normalizeInspectionRequestAttachments>,
) {
  return attachments.length > 0 ? JSON.stringify(attachments) : null;
}

function buildLinkedIssueWhere(
  request: { linkedIssueId?: null | string; linkedIssueNo?: null | string },
  issueId?: null | string,
): null | Prisma.quality_recordsWhereInput {
  const ids = [
    normalizeInspectionRequestText(issueId),
    normalizeInspectionRequestText(request.linkedIssueId),
  ].filter(Boolean);
  const issueNo = normalizeInspectionRequestText(request.linkedIssueNo);

  const OR: Prisma.quality_recordsWhereInput[] = [];
  if (ids.length > 0) {
    OR.push({ id: { in: [...new Set(ids)] } });
  }
  if (issueNo) {
    OR.push({ nonConformanceNumber: issueNo });
  }

  return OR.length > 0 ? { isDeleted: false, OR } : null;
}

function getCloseErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return '关闭报检任务失败';

  const message = String(error.message || '').trim();
  if (!message) return '关闭报检任务失败';
  if (message.startsWith('VALIDATION:')) {
    return message.replace('VALIDATION:', '');
  }
  if (process.env.NODE_ENV === 'development') {
    return `关闭报检任务失败：${message}`;
  }

  return '关闭报检任务失败';
}

async function runClosePostCommitTask(
  label: string,
  task: () => Promise<unknown>,
) {
  try {
    await task();
  } catch (error) {
    logApiError(`inspection-request-close-${label}`, error);
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
    const totalQuantity = parseInspectionRequestQuantity(
      body.quantity,
      request.quantity || 1,
    );
    const unqualifiedQuantity =
      result === 'FAIL'
        ? Math.max(
            1,
            Math.min(
              totalQuantity,
              Math.trunc(parseCloseRequestNumber(body.unqualifiedQuantity, 1)),
            ),
          )
        : 0;
    const qualifiedQuantity = Math.max(0, totalQuantity - unqualifiedQuantity);
    const shouldCloseRequest = result === 'PASS';
    let issueCreateData: Prisma.quality_recordsCreateInput | undefined;
    let issueAuditDetails = '';
    const closeInspectorId =
      request.inspectorId ||
      (await resolveInspectionRequestCurrentUserId(userinfo, prisma));

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
          normalizeInspectionRequestText(request.componentName) ||
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
          '生产 OBU',
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

    const {
      closedLinkedIssueCount,
      record: updated,
      issue,
    } = await prisma.$transaction(async (tx) => {
      const issueRecord = issueCreateData
        ? await tx.quality_records.create({ data: issueCreateData })
        : null;
      const linkedIssueWhere = buildLinkedIssueWhere(request, issueRecord?.id);
      let linkedIssueStatus =
        issueRecord?.status || request.linkedIssueStatus || null;
      let closedLinkedIssueCount = 0;

      if (shouldCloseRequest && linkedIssueWhere) {
        const linkedIssueUpdate = await tx.quality_records.updateMany({
          data: { status: 'CLOSED' },
          where: {
            ...linkedIssueWhere,
            status: { not: 'CLOSED' },
          },
        });
        closedLinkedIssueCount = linkedIssueUpdate.count;
        linkedIssueStatus = 'CLOSED';
      }

      if (explicitInspectionId && inspectionId) {
        await tx.inspections.update({
          data: {
            inspector:
              normalizeInspectionRequestText(body.inspector) ||
              request.reporter,
            quantity: totalQuantity,
            qualifiedQuantity,
            remarks:
              normalizeInspectionRequestText(body.closeRemark) ||
              request.requestInfo,
            result: result === 'FAIL' ? 'FAIL' : 'PASS',
            unqualifiedQuantity,
          },
          where: { id: inspectionId },
        });
      }

      const record = await tx.qms_inspection_requests.update({
        data: {
          closeAttachments:
            closeAttachments.length > 0
              ? JSON.stringify(closeAttachments)
              : null,
          closeRemark: normalizeInspectionRequestText(body.closeRemark) || null,
          closedAt: shouldCloseRequest ? new Date() : null,
          inspectionId,
          inspectionResult: result === 'FAIL' ? 'FAIL' : 'PASS',
          inspectorId: closeInspectorId || request.inspectorId,
          linkedIssueId: issueRecord?.id || request.linkedIssueId || null,
          linkedIssueNo:
            issueRecord?.nonConformanceNumber || request.linkedIssueNo || null,
          linkedIssueStatus,
          qualifiedQuantity,
          status: shouldCloseRequest
            ? INSPECTION_REQUEST_STATUS.CLOSED
            : INSPECTION_REQUEST_STATUS.INSPECTING,
          unqualifiedQuantity,
        },
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
        where: { id },
      });

      if (record.dispatchTaskId) {
        await tx.qms_task_dispatches.updateMany({
          data: { status: shouldCloseRequest ? 'COMPLETED' : 'PROCESSING' },
          where: { id: record.dispatchTaskId },
        });
      }

      return { closedLinkedIssueCount, issue: issueRecord, record };
    });

    await runClosePostCommitTask('request-file-references', () =>
      FileStorageService.registerReferencesFromAttachments({
        attachments: closeAttachments,
        bizId: String(updated.id),
        bizType: 'inspection_request',
        fieldName: 'closeAttachments',
      }),
    );
    const currentInspection = await prisma.inspections.findUnique({
      select: { documents: true },
      where: { id: inspectionId },
    });
    const inspectionDocuments = mergeInspectionRequestAttachments(
      currentInspection?.documents,
      closeAttachments,
    );
    await runClosePostCommitTask('inspection-documents', async () => {
      await prisma.inspections.update({
        data: {
          documents: stringifyCloseInspectionDocuments(inspectionDocuments),
          hasDocuments: inspectionDocuments.length > 0,
        },
        where: { id: inspectionId },
      });
      await FileStorageService.registerReferencesFromAttachments({
        attachments: inspectionDocuments,
        bizId: String(inspectionId),
        bizType: 'inspection_record',
        fieldName: 'documents',
      });
    });

    if (issue && linkedIssue?.photos !== undefined) {
      await runClosePostCommitTask('issue-file-references', () =>
        FileStorageService.registerReferencesFromAttachments({
          attachments: linkedIssue.photos,
          bizId: String(issue.id),
          bizType: 'inspection_issue',
          fieldName: 'photos',
        }),
      );
    }

    if (issue || closedLinkedIssueCount > 0) {
      const { SystemLogService } = await import(
        '~/services/system-log.service'
      );
      const { WelderScoreService } = await import(
        '~/services/welder-score.service'
      );

      if (issue) {
        await runClosePostCommitTask('issue-audit-log', () =>
          SystemLogService.recordAuditLog({
            userId: String(userinfo.id),
            action: 'CREATE',
            targetType: 'inspection_issue',
            targetId: String(issue.id),
            details:
              issueAuditDetails ||
              `新增检验问题: ${issue.partName} (${issue.nonConformanceNumber || '无编号'})`,
          }),
        );
      }
      if (closedLinkedIssueCount > 0 && updated.linkedIssueId) {
        await runClosePostCommitTask('linked-issue-close-audit-log', () =>
          SystemLogService.recordAuditLog({
            userId: String(userinfo.id),
            action: 'UPDATE',
            targetType: 'inspection_issue',
            targetId: String(updated.linkedIssueId),
            details: `复检合格关闭关联检验问题: ${updated.linkedIssueNo || updated.linkedIssueId}`,
          }),
        );
      }
      await runClosePostCommitTask('welder-score-sync', () =>
        WelderScoreService.syncFromInspectionIssues(),
      );
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
    const message = getCloseErrorMessage(error);
    if (error instanceof Error && error.message.startsWith('VALIDATION:')) {
      return badRequestResponse(event, message);
    }
    return internalServerErrorResponse(event, message);
  }
});
