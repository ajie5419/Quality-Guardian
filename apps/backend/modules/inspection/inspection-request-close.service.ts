import type { Prisma } from '@prisma/client';
import type { H3Event } from 'h3';
import type { UserSession } from '~/utils/jwt-utils';

import type { InspectionAccessContext } from './inspection-access-context';
import type { CloseInspectionRecordLink } from './inspection-request-close-records.service';

import { createScopedRepository } from '~/modules/data-scope';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { QualityLossIndexQueue } from '~/modules/quality-loss';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import prisma from '~/utils/prisma';

import { toScopedAccessContext } from './inspection-access-context';
import {
  INSPECTION_REQUEST_STATUS,
  mapInspectionRequest,
  normalizeInspectionRequestAttachments,
  normalizeInspectionRequestText,
  parseInspectionRequestQuantity,
  resolveInspectionRequestCurrentUserId,
} from './inspection-request';
import { ensureCloseRequestAccess } from './inspection-request-close-access.service';
import {
  runClosePostCommitTask,
  syncCloseAttachments,
  syncCloseIssueEffects,
  updateDerivedDispatchTask,
} from './inspection-request-close-effects.service';
import { buildCloseLinkedIssueCreateResult } from './inspection-request-close-issue.service';
import { buildCloseLinkedIssueWhere } from './inspection-request-close-linked-issue.service';
import { createCloseInspectionRecords } from './inspection-request-close-records.service';
import { hydrateOutsourcingLinkedIssueResponsibility } from './inspection-request-close-responsibility-hydration';
import {
  assertCloseLinkedIssueResponsibilityMatches,
  assertExistingCloseLinkedIssueResponsibilityMatches,
  buildCloseInspectionResponsibilityWrite,
  requireCanonicalCloseResponsibility,
  resolveLegacyCloseRequestResponsibility,
} from './inspection-request-close-responsibility.service';
import { retryOnSerialNumberConflict } from './inspection-request-close-serial-retry';
import {
  failCloseRequest,
  parseCloseRequestNumber,
  validateCloseRequestBody,
} from './inspection-request-close.schema';
import { inspectionRequestWorkOrdersInclude } from './inspection-request-work-orders';

export { hydrateOutsourcingLinkedIssueResponsibility } from './inspection-request-close-responsibility-hydration';
export const InspectionRequestCloseService = {
  async closeRequest(
    event: H3Event,
    id: string,
    body: Record<string, unknown>,
    userinfo: UserSession,
    access?: InspectionAccessContext,
  ) {
    validateCloseRequestBody(body);
    const explicitInspectionId = normalizeInspectionRequestText(
      body.inspectionId,
    );
    const scopedAccess = access
      ? toScopedAccessContext(access)
      : {
          user: { id: userinfo.userId || userinfo.id || 'unknown' },
          scope: { scopeType: 'ALL' as const },
        };
    const requestRepo = createScopedRepository(
      'inspection',
      prisma.qms_inspection_requests,
    );
    const request = (await requestRepo.findAccessible(
      {
        include: {
          process: { select: { name: true } },
          work_order: { select: { projectName: true } },
          workOrders: inspectionRequestWorkOrdersInclude,
        },
        where: { id, isDeleted: false },
      },
      scopedAccess,
    )) as Prisma.qms_inspection_requestsGetPayload<{
      include: {
        process: true;
        work_order: true;
        workOrders: true;
      };
    }>;
    if (!request) failCloseRequest('NOT_FOUND', '报检任务不存在');
    await ensureCloseRequestAccess({ request, userinfo });
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
    const responsibility =
      body.responsibility && typeof body.responsibility === 'object'
        ? (body.responsibility as Record<string, unknown>)
        : undefined;
    const closeResponsibility =
      responsibility || (result === 'FAIL' ? linkedIssue : undefined);
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
        const txRequestRepo = createScopedRepository(
          'inspection',
          tx.qms_inspection_requests,
        );
        const guard = await txRequestRepo.updateAccessible(
          {
            data: { status: INSPECTION_REQUEST_STATUS.INSPECTING },
            where: {
              id,
              isDeleted: false,
              status: request.status,
            },
          },
          scopedAccess,
        );
        if (guard.count === 0)
          failCloseRequest('BAD_REQUEST', '报检任务已检验完成');
        const authorizedSource = {
          casVerified: true as const,
          dataScopeVerified: true as const,
          source: { id, model: 'qms_inspection_requests' as const },
          transaction: tx,
        };
        const currentLink = await tx.qms_inspection_requests.findUnique({
          select: {
            category: true,
            linkedIssueId: true,
            linkedIssueNo: true,
            linkedIssueStatus: true,
            responsibilityType: true,
            responsibleDepartment: true,
            responsibleDepartmentId: true,
            supplierId: true,
            supplierName: true,
            teamId: true,
          },
          where: { id },
        });
        if (!currentLink) failCloseRequest('NOT_FOUND', '报检任务不存在');
        const requestAtClose = { ...request, ...currentLink };
        let inspectionId = explicitInspectionId;
        const responsibilityResolution =
          await resolveLegacyCloseRequestResponsibility({
            responsibility: closeResponsibility,
            request: requestAtClose,
            tx,
          });
        const requestWithResponsibility = responsibilityResolution.request;
        const canonicalCloseResponsibility =
          requireCanonicalCloseResponsibility(requestWithResponsibility);
        const linkedIssueWithCanonicalResponsibility =
          result === 'FAIL' && linkedIssue
            ? hydrateOutsourcingLinkedIssueResponsibility({
                linkedIssue,
                responsibility: canonicalCloseResponsibility,
              })
            : linkedIssue;
        if (result === 'FAIL' && linkedIssueWithCanonicalResponsibility) {
          assertCloseLinkedIssueResponsibilityMatches({
            linkedIssue: linkedIssueWithCanonicalResponsibility,
            responsibility: canonicalCloseResponsibility,
          });
        }
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
          inspectionLinks = await createCloseInspectionRecords({
            body,
            request: requestWithResponsibility,
            sourceContext: authorizedSource,
            tx,
          });
          inspectionId = inspectionLinks[0]?.inspectionId || '';
        }
        if (explicitInspectionId && inspectionId) {
          const existingInspection = await tx.inspections.findFirst({
            select: {
              id: true,
              responsibilityType: true,
              responsibleDepartment: true,
              responsibleDepartmentId: true,
              supplierId: true,
              supplierName: true,
            },
            where: {
              id: inspectionId,
              isDeleted: false,
              workOrderNumber: request.workOrderNumber,
            },
          });
          if (!existingInspection) {
            failCloseRequest(
              'BAD_REQUEST',
              '关联的检验记录不存在，或工单号与报检任务不一致',
            );
          }
          // qms-arch-allow R-SCOPE: request CAS authorizes this linked inspection.
          await tx.inspections.update({
            data: {
              ...buildCloseInspectionResponsibilityWrite({
                inspection: existingInspection,
                request: requestWithResponsibility,
              }),
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

        let issueRecord = null;
        let createdIssue = false;
        let issueAuditVariables:
          | undefined
          | { issue: string; nonConformanceNumber: null | string };
        if (result === 'FAIL' && inspectionId) {
          if (currentLink.linkedIssueId) {
            issueRecord = await tx.quality_records.findFirst({
              where: { id: currentLink.linkedIssueId, isDeleted: false },
            });
            if (!issueRecord) {
              failCloseRequest(
                'CONFLICT',
                '关联的不合格项不存在，不能重复创建',
              );
            }
            assertExistingCloseLinkedIssueResponsibilityMatches({
              issue: issueRecord,
              responsibility: canonicalCloseResponsibility,
            });
          } else if (linkedIssueWithCanonicalResponsibility) {
            const built = await buildCloseLinkedIssueCreateResult({
              body,
              inspectionId,
              linkedIssue: linkedIssueWithCanonicalResponsibility,
              request: requestWithResponsibility,
              sourceContext: authorizedSource,
              tx,
              userinfo,
            });
            createdIssue = true;
            issueRecord = built.record;
            issueAuditVariables = built.auditVariables;
          }
        }

        const linkedIssueWhere = buildCloseLinkedIssueWhere(
          requestAtClose,
          issueRecord?.id,
        );
        let linkedIssueStatus =
          issueRecord?.status || currentLink.linkedIssueStatus || null;
        let closedLinkedIssueCount = 0;
        if (shouldCloseRequest && linkedIssueWhere) {
          const linkedIssueUpdate = await tx.quality_records.updateMany({
            data: { status: 'CLOSED' },
            where: { ...linkedIssueWhere, status: { not: 'CLOSED' } },
          });
          const updatedLinkedIssueId =
            issueRecord?.id || currentLink.linkedIssueId;
          if (linkedIssueUpdate.count > 0 && updatedLinkedIssueId) {
            await QualityLossIndexQueue.enqueue(
              tx,
              [{ source: 'INTERNAL', sourcePk: updatedLinkedIssueId }],
              'inspection-request.closed-linked-issue',
            );
          }
          closedLinkedIssueCount = linkedIssueUpdate.count;
          linkedIssueStatus = 'CLOSED';
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
        // qms-arch-allow R-SCOPE: same transaction holds the request CAS anchor.
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
            linkedIssueId: issueRecord?.id || currentLink.linkedIssueId || null,
            linkedIssueNo:
              issueRecord?.nonConformanceNumber ||
              currentLink.linkedIssueNo ||
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
          await updateDerivedDispatchTask(
            tx,
            record.dispatchTaskId,
            authorizedSource,
            {
              data: {
                status: shouldCloseRequest ? 'COMPLETED' : 'PROCESSING',
              },
              where: { id: record.dispatchTaskId },
            },
          );
        }
        const changedInspectionIdentities = await tx.inspections.findMany({
          select: {
            supplierId: true,
            teamId: true,
          },
          where: {
            id: { in: inspectionLinks.map((item) => item.inspectionId) },
            isDeleted: false,
          },
        });
        await MetricRefreshQueue.enqueueSupplierScoresForInspectionIdentities(
          tx,
          {
            supplierIds: changedInspectionIdentities.map(
              (item) => item.supplierId,
            ),
            teamIds: changedInspectionIdentities.map((item) => item.teamId),
          },
          'inspection-request.closed',
        );
        return {
          closedLinkedIssueCount,
          inspectionId,
          inspectionLinks,
          issue: issueRecord,
          issueAuditVariables,
          createdIssue,
          resolvedLegacyResponsibility: responsibilityResolution.resolvedLegacy,
          record,
        };
      });

    const {
      closedLinkedIssueCount,
      inspectionId,
      inspectionLinks,
      issue,
      issueAuditVariables,
      createdIssue,
      resolvedLegacyResponsibility,
      record: updated,
    } = await retryOnSerialNumberConflict(runCloseTransaction, 3);
    const postCommitSource = {
      source: {
        id: String(updated.id),
        model: 'qms_inspection_requests' as const,
      },
    };

    await runClosePostCommitTask(
      'attachments',
      () =>
        syncCloseAttachments({
          closeAttachments,
          hasDocuments:
            typeof body.hasDocuments === 'boolean'
              ? body.hasDocuments
              : undefined,
          inspectionId,
          inspectionIds: inspectionLinks.map((item) => item.inspectionId),
          requestId: String(updated.id),
          selfCheckAttachments: request.attachments,
          sourceContext: postCommitSource,
        }),
      { requestId: String(updated.id) },
    );
    await runClosePostCommitTask(
      'issue-effects',
      () =>
        syncCloseIssueEffects({
          closedLinkedIssueCount,
          issue: createdIssue ? issue : null,
          issueAuditVariables,
          linkedIssue: createdIssue ? linkedIssue : undefined,
          updated,
          userinfo,
          sourceContext: postCommitSource,
        }),
      { requestId: String(updated.id) },
    );

    await runClosePostCommitTask(
      'audit-log',
      () =>
        recordBusinessAuditLog(event, {
          action: 'UPDATE',
          detailsTemplate:
            '关闭报检任务: {{requestNo}}，关联检验记录: {{inspectionId}}',
          detailsVariables: { inspectionId, requestNo: updated.requestNo },
          targetId: String(updated.id),
          targetType: 'inspection_request',
          userId: userinfo?.id,
        }),
      { requestId: String(updated.id) },
    );
    if (resolvedLegacyResponsibility) {
      await runClosePostCommitTask(
        'responsibility-audit-log',
        () =>
          recordBusinessAuditLog(event, {
            action: 'UPDATE',
            detailsTemplate: '关闭报检时裁决并固化责任事实: {{requestNo}}',
            detailsVariables: { requestNo: updated.requestNo },
            targetId: String(updated.id),
            targetType: 'inspection_request',
            userId: userinfo?.id,
          }),
        { requestId: String(updated.id) },
      );
    }
    return mapInspectionRequest(updated);
  },
};
