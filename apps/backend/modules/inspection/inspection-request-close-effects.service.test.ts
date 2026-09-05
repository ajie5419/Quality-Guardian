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
      updateMany: vi.fn(),
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
    .mockImplementation((...sources: unknown[]) => {
      const merged: Array<Record<string, unknown>> = [];
      const seen = new Set<string>();
      for (const source of sources) {
        let items: unknown = source;
        if (typeof source === 'string') {
          try {
            items = JSON.parse(source);
          } catch {
            items = [];
          }
        }
        for (const item of Array.isArray(items) ? items : []) {
          const key = String(item?.url || '');
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(item as Record<string, unknown>);
        }
      }
      return merged;
    }),
  normalizeInspectionRequestAttachments: vi
    .fn()
    .mockImplementation((v: unknown) => (Array.isArray(v) ? v : [])),
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

  it('should swallow errors and call logApiError with effect context', async () => {
    const { logApiError } = await import('~/utils/api-logger');
    const task = vi.fn().mockRejectedValue(new Error('boom'));
    await runClosePostCommitTask('test-label', task, {
      inspectionId: 'i-1',
      requestId: 'req-1',
    });
    expect(logApiError).toHaveBeenCalledWith(
      'inspection-request-close-test-label',
      expect.any(Error),
      expect.objectContaining({
        effectName: 'test-label',
        inspectionId: 'i-1',
        requestId: 'req-1',
      }),
    );
  });
});

describe('syncCloseAttachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should CAS-merge inspection documents with snapshot anchors', async () => {
    const { FileStorageService } = await import(
      '~/modules/file-storage/file-storage.service'
    );
    (prisma.inspections.findUnique as any).mockResolvedValue({
      documents: null,
      selfCheckDocuments: null,
    });
    (prisma.inspections.updateMany as any).mockResolvedValue({ count: 1 });

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
    const write = (prisma.inspections.updateMany as any).mock.calls[0][0];
    expect(write.data).toEqual(
      expect.objectContaining({
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
    );
    // The CAS anchor must key on the exact snapshot values that were read.
    expect(write.where).toEqual({
      id: 'i-1',
      documents: null,
      selfCheckDocuments: null,
    });
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

  it('should retry the merge when the CAS anchor misses, preserving both writers', async () => {
    (prisma.inspections.findUnique as any)
      .mockResolvedValueOnce({
        documents: JSON.stringify([
          { name: 'a.pdf', size: 1, type: 'application/pdf', url: 'http://a' },
        ]),
        selfCheckDocuments: null,
      })
      .mockResolvedValueOnce({
        documents: JSON.stringify([
          { name: 'a.pdf', size: 1, type: 'application/pdf', url: 'http://a' },
          { name: 'b.pdf', size: 1, type: 'application/pdf', url: 'http://b' },
        ]),
        selfCheckDocuments: null,
      });
    (prisma.inspections.updateMany as any)
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await syncCloseAttachments({
      closeAttachments: [
        { name: 'b.pdf', size: 1, type: 'application/pdf', url: 'http://b' },
      ],
      inspectionId: 'i-1',
      requestId: 'req-1',
      selfCheckAttachments: [],
    });

    expect(prisma.inspections.updateMany).toHaveBeenCalledTimes(2);
    const firstWrite = (prisma.inspections.updateMany as any).mock.calls[0][0];
    const secondWrite = (prisma.inspections.updateMany as any).mock.calls[1][0];
    // First attempt anchored on the stale read; second attempt anchored on the
    // fresh value that already contains the concurrent writer's b.pdf, so the
    // final persisted documents keep both A and B.
    expect(firstWrite.where.documents).toContain('http://a');
    expect(secondWrite.where.documents).toContain('http://b');
    expect(secondWrite.data.documents).toContain('http://a');
  });

  it('should give up after bounded retries and log with failure context', async () => {
    const { logApiError } = await import('~/utils/api-logger');
    (prisma.inspections.findUnique as any).mockResolvedValue({
      documents: null,
      selfCheckDocuments: null,
    });
    (prisma.inspections.updateMany as any).mockResolvedValue({ count: 0 });

    await syncCloseAttachments({
      closeAttachments: [],
      inspectionId: 'i-1',
      requestId: 'req-1',
      selfCheckAttachments: [],
    });

    expect(prisma.inspections.updateMany).toHaveBeenCalledTimes(3);
    expect(logApiError).toHaveBeenCalledWith(
      'inspection-request-close-inspection-documents',
      expect.any(Error),
      expect.objectContaining({
        effectName: 'inspection-documents',
        inspectionId: 'i-1',
        requestId: 'req-1',
      }),
    );
  });

  it('should isolate a failing inspection from the remaining effects', async () => {
    const { FileStorageService } = await import(
      '~/modules/file-storage/file-storage.service'
    );
    (prisma.inspections.findUnique as any).mockResolvedValue({
      documents: null,
      selfCheckDocuments: null,
    });
    (prisma.inspections.updateMany as any)
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await syncCloseAttachments({
      closeAttachments: [],
      inspectionId: 'i-bad',
      inspectionIds: ['i-ok'],
      requestId: 'req-1',
      selfCheckAttachments: [],
    });

    // i-bad exhausts its retries; i-ok still succeeds and registers references.
    expect(
      FileStorageService.registerReferencesFromAttachments,
    ).toHaveBeenCalledWith(expect.objectContaining({ bizId: 'i-ok' }));
  });

  it('should merge idempotently (no duplicate entries on re-run)', async () => {
    const { FileStorageService } = await import(
      '~/modules/file-storage/file-storage.service'
    );
    (prisma.inspections.findUnique as any).mockResolvedValue({
      documents: JSON.stringify([
        { name: 'a.pdf', size: 1, type: 'application/pdf', url: 'http://a' },
      ]),
      selfCheckDocuments: null,
    });
    (prisma.inspections.updateMany as any).mockResolvedValue({ count: 1 });

    await syncCloseAttachments({
      closeAttachments: [
        { name: 'a.pdf', size: 1, type: 'application/pdf', url: 'http://a' },
      ],
      inspectionId: 'i-1',
      requestId: 'req-1',
      selfCheckAttachments: [],
    });

    const write = (prisma.inspections.updateMany as any).mock.calls[0][0];
    const persisted = JSON.parse(write.data.documents);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].url).toBe('http://a');
    expect(
      FileStorageService.registerReferencesFromAttachments,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: expect.arrayContaining([
          expect.objectContaining({ url: 'http://a' }),
        ]),
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
      updated: {
        id: 'req-1',
        linkedIssueId: null,
        linkedIssueNo: null,
      },
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
      updated: {
        id: 'req-1',
        linkedIssueId: null,
        linkedIssueNo: null,
      },
      userinfo: { id: 'user-1' } as any,
    });

    expect(SystemLogService.auditLog).not.toHaveBeenCalled();
    expect(WelderScoreRefreshService.enqueueFullRefresh).not.toHaveBeenCalled();
  });
});
