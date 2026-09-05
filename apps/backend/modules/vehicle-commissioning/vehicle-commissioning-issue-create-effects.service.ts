import { FileStorageService } from '~/modules/file-storage';
import { SystemLogService } from '~/modules/system-log';
import { logApiWarn } from '~/utils/api-logger';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';

/**
 * Post-commit side effects of a commissioning issue create. Idempotency
 * handlers call this only when the request was NOT replayed, so a network
 * retry never re-registers photo references or writes a duplicate audit row.
 */
export async function applyIssueCreatePostCommit(options: {
  description: string;
  issueId: string;
  operatorUserId?: string;
  photos: string[];
}) {
  try {
    await FileStorageService.registerReferencesFromAttachments({
      attachments: options.photos,
      bizId: String(options.issueId),
      bizType: 'vehicle_commissioning_issue',
      fieldName: 'photos',
    });
  } catch (error) {
    if (!isPrismaSchemaMismatchError(error)) throw error;
    logApiWarn(
      'vehicle-commissioning-issue-create',
      'photo file reference schema mismatch, skipping reference registration',
      { issueId: options.issueId },
    );
  }
  if (options.operatorUserId) {
    await SystemLogService.auditLog('vehicle-commissioning', 'issueCreate', {
      detailsVariables: {
        issue: options.description || options.issueId,
      },
      targetId: options.issueId,
      userId: options.operatorUserId,
    });
  }
}
