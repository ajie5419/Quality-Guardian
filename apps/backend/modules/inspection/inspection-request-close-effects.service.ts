import type { Prisma } from '@prisma/client';
import type { UserSession } from '~/utils/jwt-utils';

import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { SystemLogService } from '~/modules/system-log';
import { WelderScoreRefreshService } from '~/modules/welder';
import { logApiError } from '~/utils/api-logger';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

import {
  mergeInspectionRequestAttachments,
  normalizeInspectionRequestAttachments,
} from './inspection-request';

export interface AuthorizedSourceContext {
  casVerified: true;
  dataScopeVerified: true;
  source: { id: string; model: 'qms_inspection_requests' };
  transaction: Prisma.TransactionClient;
}

type CloseAttachment = ReturnType<typeof normalizeInspectionRequestAttachments>;
type PostCommitSourceContext = Pick<AuthorizedSourceContext, 'source'>;

// Bounded CAS retries for the inspection documents merge
// (CLOSE-EFFECTS-INTEGRITY-001). The merge is a read-compute-write on the
// JSON snapshot columns; each retry reads a fresh snapshot outside any
// transaction so a lost CAS always sees the latest committed value. The loop
// must stay bounded: exhaustion is reported through the post-commit task log
// for manual compensation instead of spinning forever.
const MAX_DOCUMENT_MERGE_ATTEMPTS = 3;

export async function runClosePostCommitTask(
  label: string,
  task: () => Promise<unknown>,
  context?: { inspectionId?: string; requestId?: string },
) {
  try {
    await task();
  } catch (error) {
    logApiError(
      `inspection-request-close-${label}`,
      error,
      context
        ? {
            effectName: label,
            inspectionId: context.inspectionId,
            requestId: context.requestId,
          }
        : undefined,
    );
  }
}

export async function updateDerivedDispatchTask(
  tx: Prisma.TransactionClient,
  dispatchTaskId: string,
  sourceContext: AuthorizedSourceContext,
  args: {
    data: Prisma.qms_task_dispatchesUpdateManyArgs['data'];
    where: Prisma.qms_task_dispatchesWhereInput;
  },
) {
  if (sourceContext.transaction !== tx || !sourceContext.casVerified) {
    throw new Error('Derived dispatch write requires authorized close source');
  }
  return tx.qms_task_dispatches.updateMany({
    ...args,
    where: { ...args.where, id: dispatchTaskId },
  });
}

/**
 * Merges close attachments into the inspection documents snapshot columns with
 * an optimistic CAS anchor on the exact values that were read. A concurrent
 * merger wins only if the columns are unchanged since our read; otherwise the
 * attempt is retried against the fresh values. Returns the merged lists that
 * were actually persisted so the caller can register file references from the
 * same snapshot it wrote (the merge is deterministic for a given read).
 */
async function mergeInspectionDocumentsWithCas(options: {
  closeAttachments: CloseAttachment;
  hasDocuments?: boolean;
  inspectionId: string;
  selfCheckAttachments?: unknown;
}): Promise<{
  documents: CloseAttachment;
  selfCheckDocuments: CloseAttachment;
}> {
  for (let attempt = 1; ; attempt++) {
    const currentInspection = await prisma.inspections.findUnique({
      select: { documents: true, selfCheckDocuments: true },
      where: { id: options.inspectionId },
    });
    const inspectionDocuments = mergeInspectionRequestAttachments(
      currentInspection?.documents,
      options.closeAttachments,
    );
    const selfCheckDocuments = mergeInspectionRequestAttachments(
      currentInspection?.selfCheckDocuments,
      options.selfCheckAttachments,
    );
    const resolvedHasDocuments =
      typeof options.hasDocuments === 'boolean'
        ? options.hasDocuments
        : inspectionDocuments.length > 0;
    const result = await prisma.inspections.updateMany({
      data: {
        documents: stringifyCloseInspectionDocuments(inspectionDocuments),
        hasDocuments: resolvedHasDocuments,
        selfCheckDocuments:
          stringifyCloseInspectionDocuments(selfCheckDocuments),
        hasSelfCheckDocuments: selfCheckDocuments.length > 0,
      },
      where: {
        id: options.inspectionId,
        documents: currentInspection?.documents ?? null,
        selfCheckDocuments: currentInspection?.selfCheckDocuments ?? null,
      },
    });
    if (result.count === 1) {
      return { documents: inspectionDocuments, selfCheckDocuments };
    }
    if (attempt >= MAX_DOCUMENT_MERGE_ATTEMPTS) {
      throw new BusinessError(
        'CONFLICT',
        `检验记录文档并发合并超过重试上限: ${options.inspectionId}`,
      );
    }
  }
}

export async function syncCloseAttachments(options: {
  closeAttachments: CloseAttachment;
  hasDocuments?: boolean;
  inspectionId: string;
  inspectionIds?: string[];
  requestId: string;
  selfCheckAttachments?: unknown;
  sourceContext?: PostCommitSourceContext;
}) {
  // Queue/effect boundary keeps only the source identity after commit; the
  // transaction proof is intentionally not reused outside its transaction.
  await runClosePostCommitTask(
    'request-file-references',
    () =>
      FileStorageService.registerReferencesFromAttachments({
        attachments: options.closeAttachments,
        bizId: options.requestId,
        bizType: 'inspection_request',
        fieldName: 'closeAttachments',
      }),
    { requestId: options.requestId },
  );
  const inspectionIds = [
    ...new Set([options.inspectionId, ...(options.inspectionIds || [])]),
  ];
  for (const inspectionId of inspectionIds) {
    // Per-inspection isolation: one inspection's merge failure must not
    // suppress the references of the other inspections (each effect is
    // independently retryable and logged with the inspection id).
    await runClosePostCommitTask(
      'inspection-documents',
      async () => {
        const merged = await mergeInspectionDocumentsWithCas({
          closeAttachments: options.closeAttachments,
          hasDocuments: options.hasDocuments,
          inspectionId,
          selfCheckAttachments: options.selfCheckAttachments,
        });
        await FileStorageService.registerReferencesFromAttachments({
          attachments: merged.documents,
          bizId: inspectionId,
          bizType: 'inspection_record',
          fieldName: 'documents',
        });
        await FileStorageService.registerReferencesFromAttachments({
          attachments: merged.selfCheckDocuments,
          bizId: inspectionId,
          bizType: 'inspection_record',
          fieldName: 'selfCheckDocuments',
        });
      },
      { inspectionId, requestId: options.requestId },
    );
  }
}

export async function syncCloseIssueEffects(options: {
  closedLinkedIssueCount: number;
  issue: null | {
    id: string;
    nonConformanceNumber: null | string;
    partName: string;
  };
  issueAuditVariables?: { issue: string; nonConformanceNumber: null | string };
  linkedIssue?: Record<string, unknown>;
  sourceContext?: PostCommitSourceContext;
  updated: {
    id: string;
    linkedIssueId: null | string;
    linkedIssueNo: null | string;
  };
  userinfo: UserSession;
}) {
  // Post-commit effects receive the authorized source identity for tracing;
  // queue internals remain unchanged in this phase.
  if (options.issue && options.linkedIssue?.photos !== undefined) {
    await runClosePostCommitTask(
      'issue-file-references',
      () =>
        FileStorageService.registerReferencesFromAttachments({
          attachments: options.linkedIssue?.photos,
          bizId: String(options.issue?.id),
          bizType: 'inspection_issue',
          fieldName: 'photos',
        }),
      { requestId: String(options.updated.id) },
    );
  }
  if (!options.issue && options.closedLinkedIssueCount === 0) {
    return;
  }
  if (options.issue) {
    await runClosePostCommitTask(
      'issue-audit-log',
      () =>
        SystemLogService.auditLog('inspection', 'issueCreateFromClose', {
          userId: String(options.userinfo.id),
          targetId: String(options.issue?.id),
          detailsVariables: {
            issue: options.issueAuditVariables?.issue || options.issue.partName,
            nonConformanceNumber:
              options.issueAuditVariables?.nonConformanceNumber ||
              options.issue.nonConformanceNumber ||
              '无编号',
          },
        }),
      { requestId: String(options.updated.id) },
    );
  }
  if (options.closedLinkedIssueCount > 0 && options.updated.linkedIssueId) {
    await runClosePostCommitTask(
      'linked-issue-close-audit-log',
      () =>
        SystemLogService.auditLog('inspection', 'issueCloseLinked', {
          userId: String(options.userinfo.id),
          targetId: String(options.updated.linkedIssueId),
          detailsVariables: {
            linkedIssue:
              options.updated.linkedIssueNo || options.updated.linkedIssueId,
          },
        }),
      { requestId: String(options.updated.id) },
    );
  }
  await runClosePostCommitTask(
    'welder-score-enqueue',
    () =>
      WelderScoreRefreshService.enqueueFullRefresh(
        prisma,
        'inspection-request.closed',
      ),
    { requestId: String(options.updated.id) },
  );
}

function stringifyCloseInspectionDocuments(attachments: CloseAttachment) {
  return attachments.length > 0 ? JSON.stringify(attachments) : null;
}
