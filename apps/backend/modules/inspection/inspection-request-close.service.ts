import type { Prisma } from '@prisma/client';
import type { H3Event } from 'h3';
import type { UserSession } from '~/utils/jwt-utils';

import type { CloseInspectionRecordLink } from './inspection-request-close-records.service';

import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import prisma from '~/utils/prisma';

import { isInspectionSerialNumberConflict } from './inspection-record-types';
import {
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
import { createCloseInspectionRecords } from './inspection-request-close-records.service';
import {
  failCloseRequest,
  parseCloseRequestNumber,
  validateCloseRequestBody,
} from './inspection-request-close.schema';
import { inspectionRequestWorkOrdersInclude } from './inspection-request-work-orders';

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
    validateCloseRequestBody(body);
    const explicitInspectionId = normalizeInspectionRequestText(
      body.inspectionId,
    );
    const request = await prisma.qms_inspection_requests.findFirst({
      include: {
        process: { select: { name: true } },
        work_order: { select: { projectName: true } },
        workOrders: inspectionRequestWorkOrdersInclude,
      },
      where: { id, isDeleted: false },
    });
    if (!request) failCloseRequest('NOT_FOUND', '报检任务不存在');
    if (request.status === INSPECTION_REQUEST_STATUS.CLOSED)
      failCloseRequest('BAD_REQUEST', '报检任务已检验完成');

    if (explicitInspectionId) {
      const inspection = await prisma.inspections.findFirst({
        select: { id: true },
        where: {
          id: explicitInspectionId,
          isDeleted: false,
          workOrderNumber: request.workOrderNumber,
        },
      });
      if (!inspection)
        failCloseRequest(
          'BAD_REQUEST',
          '关联的检验记录不存在，或工单号与报检任务不一致',
        );
    }

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
    const closeInspectorId =
      request.inspectorId ||
      (await resolveInspectionRequestCurrentUserId(userinfo, prisma));

    const runCloseTransaction = () =>
      prisma.$transaction(async (tx) => {
        // Atomic guard: the authoritative status check happens inside the
        // transaction, so concurrent close attempts cannot both pass.
        const guard = await tx.qms_inspection_requests.updateMany({
          data: { status: INSPECTION_REQUEST_STATUS.INSPECTING },
          where: {
            id,
            isDeleted: false,
            status: { not: INSPECTION_REQUEST_STATUS.CLOSED },
          },
        });
        if (guard.count === 0)
          failCloseRequest('BAD_REQUEST', '报检任务已检验完成');

        let inspectionId = explicitInspectionId;
        let inspectionLinks: CloseInspectionRecordLink[] = explicitInspectionId
          ? [
              {
                inspectionId: explicitInspectionId,
                isPrimary: true,
                workOrderNumber: request.workOrderNumber,
              },
            ]
          : [];
        if (!inspectionId) {
          // Created inside the transaction so a failed close leaves no
          // orphan inspection records behind.
          inspectionLinks = await createCloseInspectionRecords({
            body,
            request,
            tx,
          });
          inspectionId = inspectionLinks[0]?.inspectionId || '';
        }

        let issueCreateData: Prisma.quality_recordsCreateInput | undefined;
        let issueAuditVariables:
          | undefined
          | { issue: string; nonConformanceNumber: string };
        if (result === 'FAIL' && linkedIssue && inspectionId) {
          const built = await buildCloseLinkedIssueCreateResult({
            body,
            inspectionId,
            linkedIssue,
            request,
            userinfo,
          });
          issueCreateData = built.createData;
          issueAuditVariables = built.auditVariables;
        }

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
              stationSelection: request.stationSelection,
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
        await tx.qms_inspection_request_inspections.createMany({
          data: inspectionLinks.map((item) => ({
            inspectionId: item.inspectionId,
            isPrimary: item.isPrimary,
            requestId: id,
            workOrderNumber: item.workOrderNumber,
          })),
          skipDuplicates: true,
        });
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
            workOrders: inspectionRequestWorkOrdersInclude,
          },
          where: { id },
        });
        if (record.dispatchTaskId) {
          await tx.qms_task_dispatches.updateMany({
            data: {
              status: shouldCloseRequest ? 'COMPLETED' : 'PROCESSING',
            },
            where: { id: record.dispatchTaskId },
          });
        }
        return {
          closedLinkedIssueCount,
          inspectionId,
          inspectionLinks,
          issue: issueRecord,
          issueAuditVariables,
          record,
        };
      });

    const {
      closedLinkedIssueCount,
      inspectionId,
      inspectionLinks,
      issue,
      issueAuditVariables,
      record: updated,
    } = await retryOnSerialNumberConflict(runCloseTransaction, 3);

    await syncCloseAttachments({
      closeAttachments,
      hasDocuments:
        typeof body.hasDocuments === 'boolean' ? body.hasDocuments : undefined,
      inspectionId,
      inspectionIds: inspectionLinks.map((item) => item.inspectionId),
      requestId: String(updated.id),
      selfCheckAttachments: request.attachments,
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
  },
};

async function retryOnSerialNumberConflict<T>(
  run: () => Promise<T>,
  maxAttempts: number,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      // Inspection serial numbers are generated from a read outside the
      // transaction; a concurrent create can win the unique index, so the
      // whole close transaction is re-run as one unit.
      if (attempt >= maxAttempts || !isInspectionSerialNumberConflict(error)) {
        throw error;
      }
    }
  }
}
