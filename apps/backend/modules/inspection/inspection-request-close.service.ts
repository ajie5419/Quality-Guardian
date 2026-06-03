import type { Prisma } from '@prisma/client';
import type { H3Event } from 'h3';
import type { UserSession } from '~/utils/jwt-utils';

import process from 'node:process';

import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import prisma from '~/utils/prisma';

import {
  buildInspectionRecordFromRequest,
  INSPECTION_REQUEST_STATUS,
  mapInspectionRequest,
  normalizeInspectionRequestAttachments,
  normalizeInspectionRequestText,
  parseInspectionRequestQuantity,
  resolveInspectionRequestCurrentUserId,
} from './inspection-request';
import {
  syncCloseAttachments,
  syncCloseIssueEffects,
} from './inspection-request-close-effects.service';
import { buildCloseLinkedIssueCreateResult } from './inspection-request-close-issue.service';
import {
  failCloseRequest,
  parseCloseRequestNumber,
  validateCloseRequestBody,
} from './inspection-request-close.schema';

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
  if (ids.length > 0) OR.push({ id: { in: [...new Set(ids)] } });
  if (issueNo) OR.push({ nonConformanceNumber: issueNo });
  return OR.length > 0 ? { isDeleted: false, OR } : null;
}

export const InspectionRequestCloseService = {
  async closeRequest(
    event: H3Event,
    id: string,
    body: Record<string, unknown>,
    userinfo: UserSession,
  ) {
    try {
      validateCloseRequestBody(body);
      const explicitInspectionId = normalizeInspectionRequestText(
        body.inspectionId,
      );
      const request = await prisma.qms_inspection_requests.findFirst({
        include: {
          process: { select: { name: true } },
          work_order: { select: { projectName: true } },
        },
        where: { id, isDeleted: false },
      });
      if (!request) failCloseRequest('NOT_FOUND', '报检任务不存在');
      if (request.status === INSPECTION_REQUEST_STATUS.CLOSED)
        failCloseRequest('BAD_REQUEST', '报检任务已检验完成');

      let inspectionId = explicitInspectionId;
      if (inspectionId) {
        const inspection = await prisma.inspections.findFirst({
          select: { id: true },
          where: {
            id: inspectionId,
            isDeleted: false,
            workOrderNumber: request.workOrderNumber,
          },
        });
        if (!inspection)
          failCloseRequest(
            'BAD_REQUEST',
            '关联的检验记录不存在，或工单号与报检任务不一致',
          );
      } else {
        const inspection = await buildInspectionRecordFromRequest(
          request,
          body,
        );
        inspectionId = String(inspection.id);
      }

      const closeAttachments = normalizeInspectionRequestAttachments(
        body.attachments,
      );
      const result = normalizeInspectionRequestText(body.result).toUpperCase();
      const linkedIssue = body.linkedIssue as
        | Record<string, unknown>
        | undefined;
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
                Math.trunc(
                  parseCloseRequestNumber(body.unqualifiedQuantity, 1),
                ),
              ),
            )
          : 0;
      const qualifiedQuantity = Math.max(
        0,
        totalQuantity - unqualifiedQuantity,
      );
      const shouldCloseRequest = result === 'PASS';
      let issueCreateData: Prisma.quality_recordsCreateInput | undefined;
      let issueAuditVariables:
        | undefined
        | { issue: string; nonConformanceNumber: string };
      const closeInspectorId =
        request.inspectorId ||
        (await resolveInspectionRequestCurrentUserId(userinfo, prisma));

      if (result === 'FAIL' && linkedIssue && inspectionId) {
        const result = await buildCloseLinkedIssueCreateResult({
          body,
          inspectionId,
          linkedIssue,
          request,
          userinfo,
        });
        issueCreateData = result.createData;
        issueAuditVariables = result.auditVariables;
      }

      const {
        closedLinkedIssueCount,
        issue,
        record: updated,
      } = await prisma.$transaction(async (tx) => {
        const issueRecord = issueCreateData
          ? await tx.quality_records.create({ data: issueCreateData })
          : null;
        const linkedIssueWhere = buildLinkedIssueWhere(
          request,
          issueRecord?.id,
        );
        let linkedIssueStatus =
          issueRecord?.status || request.linkedIssueStatus || null;
        let closedLinkedIssueCount = 0;
        if (shouldCloseRequest && linkedIssueWhere) {
          const linkedIssueUpdate = await tx.quality_records.updateMany({
            data: { status: 'CLOSED' },
            where: { ...linkedIssueWhere, status: { not: 'CLOSED' } },
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
            closeRemark:
              normalizeInspectionRequestText(body.closeRemark) || null,
            closedAt: shouldCloseRequest ? new Date() : null,
            inspectionId,
            inspectionResult: result === 'FAIL' ? 'FAIL' : 'PASS',
            inspectorId: closeInspectorId || request.inspectorId,
            linkedIssueId: issueRecord?.id || request.linkedIssueId || null,
            linkedIssueNo:
              issueRecord?.nonConformanceNumber ||
              request.linkedIssueNo ||
              null,
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
            process: { select: { name: true } },
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

      await syncCloseAttachments({
        closeAttachments,
        hasDocuments:
          typeof body.hasDocuments === 'boolean'
            ? body.hasDocuments
            : undefined,
        inspectionId,
        requestId: String(updated.id),
      });
      await syncCloseIssueEffects({
        closedLinkedIssueCount,
        issue,
        issueAuditVariables,
        linkedIssue,
        updated,
        userinfo,
      });

      await recordBusinessAuditLog(event, {
        action: 'UPDATE',
        detailsTemplate:
          '关闭报检任务: {{requestNo}}，关联检验记录: {{inspectionId}}',
        detailsVariables: { inspectionId, requestNo: updated.requestNo },
        targetId: String(updated.id),
        targetType: 'inspection_request',
        userId: userinfo?.id,
      });
      return mapInspectionRequest(updated);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('VALIDATION:'))
        throw error;
      const message =
        error instanceof Error ? String(error.message || '').trim() : '';
      if (
        process.env.NODE_ENV === 'development' &&
        message &&
        !message.includes(':')
      ) {
        failCloseRequest('INTERNAL', `关闭报检任务失败：${message}`);
      }
      throw error;
    }
  },
};
