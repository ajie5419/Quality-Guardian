import type { UserSession } from '~/utils/jwt-utils';

import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { SystemLogService } from '~/modules/system-log';
import { WelderScoreService } from '~/modules/welder';
import { logApiError } from '~/utils/api-logger';
import prisma from '~/utils/prisma';

import {
  mergeInspectionRequestAttachments,
  normalizeInspectionRequestAttachments,
} from './inspection-request';

type CloseAttachment = ReturnType<typeof normalizeInspectionRequestAttachments>;

export async function runClosePostCommitTask(
  label: string,
  task: () => Promise<unknown>,
) {
  try {
    await task();
  } catch (error) {
    logApiError(`inspection-request-close-${label}`, error);
  }
}

export async function syncCloseAttachments(options: {
  closeAttachments: CloseAttachment;
  inspectionId: string;
  requestId: string;
}) {
  await runClosePostCommitTask('request-file-references', () =>
    FileStorageService.registerReferencesFromAttachments({
      attachments: options.closeAttachments,
      bizId: options.requestId,
      bizType: 'inspection_request',
      fieldName: 'closeAttachments',
    }),
  );
  const currentInspection = await prisma.inspections.findUnique({
    select: { documents: true },
    where: { id: options.inspectionId },
  });
  const inspectionDocuments = mergeInspectionRequestAttachments(
    currentInspection?.documents,
    options.closeAttachments,
  );
  await runClosePostCommitTask('inspection-documents', async () => {
    await prisma.inspections.update({
      data: {
        documents: stringifyCloseInspectionDocuments(inspectionDocuments),
        hasDocuments: inspectionDocuments.length > 0,
      },
      where: { id: options.inspectionId },
    });
    await FileStorageService.registerReferencesFromAttachments({
      attachments: inspectionDocuments,
      bizId: options.inspectionId,
      bizType: 'inspection_record',
      fieldName: 'documents',
    });
  });
}

export async function syncCloseIssueEffects(options: {
  closedLinkedIssueCount: number;
  issue:
    | {
        id: string;
        nonConformanceNumber: null | string;
        partName: string;
      }
    | null;
  issueAuditVariables?: { issue: string; nonConformanceNumber: string };
  linkedIssue?: Record<string, unknown>;
  updated: {
    linkedIssueId: null | string;
    linkedIssueNo: null | string;
  };
  userinfo: UserSession;
}) {
  if (options.issue && options.linkedIssue?.photos !== undefined) {
    await runClosePostCommitTask('issue-file-references', () =>
      FileStorageService.registerReferencesFromAttachments({
        attachments: options.linkedIssue?.photos,
        bizId: String(options.issue?.id),
        bizType: 'inspection_issue',
        fieldName: 'photos',
      }),
    );
  }
  if (!options.issue && options.closedLinkedIssueCount === 0) {
    return;
  }
  if (options.issue) {
    await runClosePostCommitTask('issue-audit-log', () =>
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
    );
  }
  if (options.closedLinkedIssueCount > 0 && options.updated.linkedIssueId) {
    await runClosePostCommitTask('linked-issue-close-audit-log', () =>
      SystemLogService.auditLog('inspection', 'issueCloseLinked', {
        userId: String(options.userinfo.id),
        targetId: String(options.updated.linkedIssueId),
        detailsVariables: {
          linkedIssue:
            options.updated.linkedIssueNo || options.updated.linkedIssueId,
        },
      }),
    );
  }
  await runClosePostCommitTask('welder-score-sync', () =>
    WelderScoreService.syncFromInspectionIssues(),
  );
}

function stringifyCloseInspectionDocuments(attachments: CloseAttachment) {
  return attachments.length > 0 ? JSON.stringify(attachments) : null;
}
