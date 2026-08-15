import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  runClosePostCommitTask,
  syncCloseAttachments,
  syncCloseIssueEffects,
} from '~/modules/inspection/inspection-request-close-effects.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    inspections: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    registerReferencesFromAttachments: vi.fn(),
  },
}));

vi.mock('~/modules/system-log', () => ({
  SystemLogService: {
    auditLog: vi.fn(),
  },
}));

vi.mock('~/modules/welder', () => ({
  WelderScoreRefreshService: {
    enqueueForResponsibleText: vi.fn(),
    enqueueFullRefresh: vi.fn(),
  },
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

vi.mock('~/modules/inspection/inspection-request', () => ({
  mergeInspectionRequestAttachments: vi
    .fn()
    .mockImplementation((a, b) => [
      ...(Array.isArray(a) ? a : []),
      ...(Array.isArray(b) ? b : []),
    ]),
  normalizeInspectionRequestAttachments: vi
    .fn()
    .mockImplementation((v) => (Array.isArray(v) ? v : [])),
}));

describe('runClosePostCommitTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute task successfully', async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    await runClosePostCommitTask('test', task);
    expect(task).toHaveBeenCalled();
  });

  it('should swallow errors and call logApiError', async () => {
    const { logApiError } = await import('~/utils/api-logger');
    const task = vi.fn().mockRejectedValue(new Error('boom'));
    await runClosePostCommitTask('test-label', task);
    expect(logApiError).toHaveBeenCalledWith(
      'inspection-request-close-test-label',
      expect.any(Error),
    );
  });
});

describe('syncCloseAttachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update inspection documents', async () => {
    const { FileStorageService } = await import(
      '~/modules/file-storage/file-storage.service'
    );
    (prisma.inspections.findUnique as any).mockResolvedValue({
      documents: null,
      selfCheckDocuments: null,
    });
    (prisma.inspections.update as any).mockResolvedValue({});

    await syncCloseAttachments({
      closeAttachments: [
        { name: 'f.pdf', size: 1024, type: 'application/pdf', url: 'http://x' },
      ],
      inspectionId: 'i-1',
      requestId: 'req-1',
      selfCheckAttachments: [
        {
          name: 'self.pdf',
          size: 2048,
          type: 'application/pdf',
          url: 'http://self',
        },
      ],
    });

    expect(prisma.inspections.findUnique).toHaveBeenCalledWith({
      select: { documents: true, selfCheckDocuments: true },
      where: { id: 'i-1' },
    });
    expect(prisma.inspections.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          hasSelfCheckDocuments: true,
          selfCheckDocuments: JSON.stringify([
            {
              name: 'self.pdf',
              size: 2048,
              type: 'application/pdf',
              url: 'http://self',
            },
          ]),
        }),
      }),
    );
    expect(
      FileStorageService.registerReferencesFromAttachments,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        bizId: 'i-1',
        bizType: 'inspection_record',
        fieldName: 'selfCheckDocuments',
      }),
    );
  });
});

describe('syncCloseIssueEffects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create audit log when issue is provided', async () => {
    const { SystemLogService } = await import('~/modules/system-log');
    const { WelderScoreRefreshService } = await import('~/modules/welder');

    await syncCloseIssueEffects({
      closedLinkedIssueCount: 0,
      issue: {
        id: 'issue-1',
        nonConformanceNumber: 'NC-001',
        partName: 'Bearing',
      },
      linkedIssue: { photos: [] },
      updated: { linkedIssueId: null, linkedIssueNo: null },
      userinfo: { id: 'user-1' } as any,
    });

    expect(SystemLogService.auditLog).toHaveBeenCalled();
    expect(WelderScoreRefreshService.enqueueFullRefresh).toHaveBeenCalled();
  });

  it('should return early when no issue and closedLinkedIssueCount is 0', async () => {
    const { SystemLogService } = await import('~/modules/system-log');
    const { WelderScoreRefreshService } = await import('~/modules/welder');

    await syncCloseIssueEffects({
      closedLinkedIssueCount: 0,
      issue: null,
      updated: { linkedIssueId: null, linkedIssueNo: null },
      userinfo: { id: 'user-1' } as any,
    });

    expect(SystemLogService.auditLog).not.toHaveBeenCalled();
    expect(WelderScoreRefreshService.enqueueFullRefresh).not.toHaveBeenCalled();
  });
});
