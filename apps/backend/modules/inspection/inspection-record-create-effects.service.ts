import type { UserSession } from '~/utils/jwt-utils';

import { FileStorageService } from '~/modules/file-storage';
import { SystemLogService } from '~/modules/system-log';
import { WelderScoreService } from '~/modules/welder';
import { logApiError } from '~/utils/api-logger';

export async function runInspectionRecordPostCommitTask(
  label: string,
  task: () => Promise<unknown>,
) {
  try {
    await task();
  } catch (error) {
    logApiError(`inspection-record-create-${label}`, error);
  }
}

export async function syncLinkedIssuePostCommitEffects(options: {
  issue: { id: string; nonConformanceNumber: null | string; partName: string };
  photos: unknown;
  userinfo: UserSession;
}) {
  await runInspectionRecordPostCommitTask('linked-issue-files', () =>
    FileStorageService.registerReferencesFromAttachments({
      attachments: options.photos,
      bizId: options.issue.id,
      bizType: 'inspection_issue',
      fieldName: 'photos',
    }),
  );
  await runInspectionRecordPostCommitTask('linked-issue-audit', () =>
    SystemLogService.auditLog('inspection', 'issueCreate', {
      userId: String(options.userinfo.id),
      targetId: options.issue.id,
      detailsVariables: {
        nonConformanceNumber: options.issue.nonConformanceNumber || '无编号',
        partName: options.issue.partName,
      },
    }),
  );
  await runInspectionRecordPostCommitTask('welder-score-sync', () =>
    WelderScoreService.syncFromInspectionIssues(),
  );
}
