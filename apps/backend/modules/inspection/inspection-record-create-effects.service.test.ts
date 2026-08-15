import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  runInspectionRecordPostCommitTask,
  syncLinkedIssuePostCommitEffects,
} from './inspection-record-create-effects.service';

vi.mock('~/modules/file-storage', () => ({
  FileStorageService: { registerReferencesFromAttachments: vi.fn() },
}));
vi.mock('~/modules/system-log', () => ({
  SystemLogService: { auditLog: vi.fn() },
}));
vi.mock('~/modules/welder', () => ({
  WelderScoreRefreshService: {
    enqueueForResponsibleText: vi.fn(),
    enqueueFullRefresh: vi.fn(),
  },
}));
vi.mock('~/utils/api-logger', () => ({ logApiError: vi.fn() }));

describe('inspection record create post-commit effects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs a post-commit failure without rejecting the saved record flow', async () => {
    const { logApiError } = await import('~/utils/api-logger');

    await expect(
      runInspectionRecordPostCommitTask('audit', async () => {
        throw new Error('audit unavailable');
      }),
    ).resolves.toBeUndefined();
    expect(logApiError).toHaveBeenCalledWith(
      'inspection-record-create-audit',
      expect.any(Error),
    );
  });

  it('registers linked issue attachments after commit', async () => {
    const { FileStorageService } = await import('~/modules/file-storage');

    await syncLinkedIssuePostCommitEffects({
      issue: { id: 'issue-1', nonConformanceNumber: null, partName: 'Bearing' },
      photos: ['https://example.test/defect.jpg'],
      userinfo: { id: 'user-1', roles: [], username: 'qc', realName: 'QC' },
    });
    expect(
      FileStorageService.registerReferencesFromAttachments,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        bizId: 'issue-1',
        bizType: 'inspection_issue',
        fieldName: 'photos',
      }),
    );
  });
});
