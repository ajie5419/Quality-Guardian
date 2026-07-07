import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionIssueMutationService } from '~/modules/inspection/inspection-issue-mutation.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    quality_records: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    registerReferencesFromAttachments: vi.fn(),
    softDeleteReferences: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: {
    auditLog: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/audit-log', () => ({
  recordBusinessAuditLog: vi.fn(),
}));

vi.mock('~/modules/welder/welder-score.service', () => ({
  WelderScoreService: {
    syncFromInspectionIssues: vi.fn(),
  },
}));

vi.mock('~/modules/file-storage/import-report', () => ({
  buildImportRowError: vi.fn().mockReturnValue({}),
  buildImportSummary: vi.fn().mockReturnValue({}),
  inferImportErrorField: vi.fn().mockReturnValue('unknown'),
  toImportErrorMessage: vi.fn().mockReturnValue('error'),
}));

vi.mock('~/modules/inspection/inspection-issue', () => ({
  buildInspectionIssueCreateData: vi.fn().mockResolvedValue({
    partName: 'Part',
    processName: 'Weld',
  }),
  buildInspectionIssueUpdateData: vi.fn().mockResolvedValue({
    partName: 'Updated',
  }),
  buildInspectionIssueUpsertPayload: vi.fn(),
  createInspectionIssueId: vi.fn().mockReturnValue('ISS-2026-001'),
  findInspectionForIssue: vi.fn().mockResolvedValue(null),
  getNextInspectionIssueSerialNumber: vi.fn().mockResolvedValue(1),
}));

const mockLoggerFns = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('~/utils/logger', () => ({
  createModuleLogger: vi.fn(() => mockLoggerFns),
}));

describe('inspectionIssueMutationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.quality_records.findMany as any).mockResolvedValue([]);
    (prisma.quality_records.findUnique as any).mockResolvedValue(null);
  });

  describe('createIssue', () => {
    it('should create a quality record and return it with ncNumber', async () => {
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      (prisma.quality_records.create as any).mockResolvedValue({
        id: 'ISS-2026-001',
        nonConformanceNumber: 'NC-26KJ-001',
        partName: 'Part',
      });

      const result = await InspectionIssueMutationService.createIssue(
        mockUser,
        {},
      );

      expect(prisma.quality_records.create).toHaveBeenCalled();
      expect(result.ncNumber).toBe('NC-26KJ-001');
      const { buildInspectionIssueCreateData } = await import(
        '~/modules/inspection/inspection-issue'
      );
      expect(buildInspectionIssueCreateData).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ createdBy: 'user-1' }),
      );
    });

    it('should throw when sourceType is INSPECTION and inspectionId is missing', async () => {
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;

      await expect(
        InspectionIssueMutationService.createIssue(mockUser, {
          sourceType: 'INSPECTION',
        }),
      ).rejects.toThrow('检验记录来源创建不合格项时必须携带 inspectionId');
    });

    it('should register photo references after creation', async () => {
      const { FileStorageService } = await import(
        '~/modules/file-storage/file-storage.service'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      (prisma.quality_records.create as any).mockResolvedValue({
        id: 'ISS-2026-002',
        nonConformanceNumber: 'NC-26KJ-002',
        partName: 'Part',
      });

      await InspectionIssueMutationService.createIssue(mockUser, {
        photos: ['photo1.jpg'],
      });

      expect(
        FileStorageService.registerReferencesFromAttachments,
      ).toHaveBeenCalledWith({
        attachments: ['photo1.jpg'],
        bizId: 'ISS-2026-002',
        bizType: 'inspection_issue',
        fieldName: 'photos',
      });
    });

    it('should sync welder scores after creation', async () => {
      const { WelderScoreService } = await import(
        '~/modules/welder/welder-score.service'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      (prisma.quality_records.create as any).mockResolvedValue({
        id: 'ISS-2026-003',
        nonConformanceNumber: 'NC-26KJ-003',
        partName: 'Part',
      });

      await InspectionIssueMutationService.createIssue(mockUser, {});

      expect(WelderScoreService.syncFromInspectionIssues).toHaveBeenCalled();
    });

    it('should resolve successfully and log error when welder sync throws in createIssue', async () => {
      const { WelderScoreService } = await import(
        '~/modules/welder/welder-score.service'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      (prisma.quality_records.create as any).mockResolvedValue({
        id: 'ISS-2026-004',
        nonConformanceNumber: 'NC-26KJ-004',
        partName: 'Part',
      });
      const syncError = new Error('welder service unavailable');
      vi.mocked(WelderScoreService.syncFromInspectionIssues).mockRejectedValue(
        syncError,
      );

      const result = await InspectionIssueMutationService.createIssue(
        mockUser,
        {},
      );

      expect(result.ncNumber).toBe('NC-26KJ-004');
      expect(mockLoggerFns.error).toHaveBeenCalledWith(
        syncError,
        'welder-score-sync after createIssue',
      );
    });

    it('retries on P2002 serialNumber conflict and succeeds on second attempt; serial regenerated', async () => {
      const { getNextInspectionIssueSerialNumber } = await import(
        '~/modules/inspection/inspection-issue'
      );
      const serialMock = vi.mocked(getNextInspectionIssueSerialNumber);
      serialMock.mockResolvedValueOnce(5).mockResolvedValueOnce(6);

      const p2002 = Object.assign(
        new Error('Unique constraint failed on the fields: (`serialNumber`)'),
        { code: 'P2002', meta: { target: ['serialNumber'] } },
      );
      (prisma.quality_records.create as any)
        .mockRejectedValueOnce(p2002)
        .mockResolvedValueOnce({
          id: 'ISS-retry-1',
          nonConformanceNumber: 'NC-26KJ-010',
          partName: 'Part',
        });

      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      const result = await InspectionIssueMutationService.createIssue(
        mockUser,
        {},
      );

      expect(prisma.quality_records.create).toHaveBeenCalledTimes(2);
      expect(serialMock).toHaveBeenCalledTimes(2);
      expect(result.ncNumber).toBe('NC-26KJ-010');
    });

    it('does not retry createIssue on a generic (non-P2002) error', async () => {
      const networkError = new Error('DB connection lost');
      (prisma.quality_records.create as any).mockRejectedValue(networkError);

      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      await expect(
        InspectionIssueMutationService.createIssue(mockUser, {}),
      ).rejects.toThrow('DB connection lost');

      expect(prisma.quality_records.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateIssue', () => {
    it('should update the quality record', async () => {
      const { SystemLogService } = await import(
        '~/modules/system-log/system-log.service'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;

      await InspectionIssueMutationService.updateIssue(
        mockUser,
        'rec-1',
        {},
        null,
      );

      expect(prisma.quality_records.update).toHaveBeenCalledWith({
        where: { id: 'rec-1' },
        data: { partName: 'Updated' },
      });
      expect(SystemLogService.auditLog).toHaveBeenCalled();
    });

    it('should register photo references when photos provided in update', async () => {
      const { FileStorageService } = await import(
        '~/modules/file-storage/file-storage.service'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;

      await InspectionIssueMutationService.updateIssue(
        mockUser,
        'rec-2',
        { photos: ['new-photo.jpg'] },
        'NC-26KJ-001',
      );

      expect(
        FileStorageService.registerReferencesFromAttachments,
      ).toHaveBeenCalledWith({
        attachments: ['new-photo.jpg'],
        bizId: 'rec-2',
        bizType: 'inspection_issue',
        fieldName: 'photos',
      });
    });

    it('should not register photo references when photos is undefined', async () => {
      const { FileStorageService } = await import(
        '~/modules/file-storage/file-storage.service'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;

      await InspectionIssueMutationService.updateIssue(
        mockUser,
        'rec-3',
        {},
        null,
      );

      expect(
        FileStorageService.registerReferencesFromAttachments,
      ).not.toHaveBeenCalled();
    });

    it('should resolve successfully and log error when welder sync throws in updateIssue', async () => {
      const { WelderScoreService } = await import(
        '~/modules/welder/welder-score.service'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      (prisma.quality_records.update as any).mockResolvedValue({
        id: 'rec-5',
        partName: 'Updated',
      });
      const syncError = new Error('welder sync failed');
      vi.mocked(WelderScoreService.syncFromInspectionIssues).mockRejectedValue(
        syncError,
      );

      await expect(
        InspectionIssueMutationService.updateIssue(mockUser, 'rec-5', {}, null),
      ).resolves.toBeUndefined();

      expect(mockLoggerFns.error).toHaveBeenCalledWith(
        syncError,
        'welder-score-sync after updateIssue',
      );
    });
  });

  describe('batchDeleteIssues', () => {
    it('should soft delete records and return count', async () => {
      const { FileStorageService } = await import(
        '~/modules/file-storage/file-storage.service'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      (prisma.quality_records.updateMany as any).mockResolvedValue({
        count: 2,
      });

      const result = await InspectionIssueMutationService.batchDeleteIssues(
        {} as any,
        mockUser,
        ['rec-1', 'rec-2'],
      );

      expect(result).toBe(2);
      expect(prisma.quality_records.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['rec-1', 'rec-2'] } },
        data: { isDeleted: true, updatedAt: expect.any(Date) },
      });
      expect(FileStorageService.softDeleteReferences).toHaveBeenCalledTimes(2);
    });

    it('should sync welder scores only when records are deleted', async () => {
      const { WelderScoreService } = await import(
        '~/modules/welder/welder-score.service'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      (prisma.quality_records.updateMany as any).mockResolvedValue({
        count: 0,
      });

      await InspectionIssueMutationService.batchDeleteIssues(
        {} as any,
        mockUser,
        ['rec-3'],
      );

      expect(
        WelderScoreService.syncFromInspectionIssues,
      ).not.toHaveBeenCalled();
    });

    it('should record audit log', async () => {
      const { recordBusinessAuditLog } = await import(
        '~/modules/system-log/audit-log'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      (prisma.quality_records.updateMany as any).mockResolvedValue({
        count: 1,
      });

      await InspectionIssueMutationService.batchDeleteIssues(
        { node: { req: {} } } as any,
        mockUser,
        ['rec-4'],
      );

      expect(recordBusinessAuditLog).toHaveBeenCalledWith(
        { node: { req: {} } },
        expect.objectContaining({
          action: 'DELETE',
          targetType: 'inspection_issue',
        }),
      );
    });

    it('should resolve successfully and log error when welder sync throws in batchDeleteIssues', async () => {
      const { WelderScoreService } = await import(
        '~/modules/welder/welder-score.service'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      (prisma.quality_records.updateMany as any).mockResolvedValue({
        count: 1,
      });
      const syncError = new Error('welder batch sync failed');
      vi.mocked(WelderScoreService.syncFromInspectionIssues).mockRejectedValue(
        syncError,
      );

      const result = await InspectionIssueMutationService.batchDeleteIssues(
        {} as any,
        mockUser,
        ['rec-10'],
      );

      expect(result).toBe(1);
      expect(mockLoggerFns.error).toHaveBeenCalledWith(
        syncError,
        'welder-score-sync after batchDeleteIssues',
      );
    });
  });

  describe('importIssues', () => {
    it('should import valid items and return summary', async () => {
      const { buildImportSummary } = await import(
        '~/modules/file-storage/import-report'
      );
      const { buildInspectionIssueUpsertPayload } = await import(
        '~/modules/inspection/inspection-issue'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;

      vi.mocked(buildInspectionIssueUpsertPayload).mockResolvedValue({
        where: { workOrderNumber: 'WO-1' },
        create: { partName: 'Part' },
        update: { partName: 'Part' },
      } as any);
      vi.mocked(buildImportSummary).mockReturnValue({
        errorCount: 0,
        errors: [],
        successCount: 1,
        totalCount: 1,
      } as any);

      const result = await InspectionIssueMutationService.importIssues(
        {} as any,
        mockUser,
        [{ workOrderNumber: 'WO-1', partName: 'Part' }],
      );

      expect(result.successCount).toBe(1);
      expect(result.totalCount).toBe(1);
      expect(prisma.quality_records.upsert).toHaveBeenCalled();
    });

    it('should record row error when upsert payload is null', async () => {
      const { buildImportRowError, buildImportSummary } = await import(
        '~/modules/file-storage/import-report'
      );
      const { buildInspectionIssueUpsertPayload } = await import(
        '~/modules/inspection/inspection-issue'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;

      vi.mocked(buildInspectionIssueUpsertPayload).mockResolvedValue(null);
      vi.mocked(buildImportSummary).mockReturnValue({
        errorCount: 1,
        errors: [{ reason: 'error', row: 1 }],
        successCount: 0,
        totalCount: 1,
      } as any);

      const result = await InspectionIssueMutationService.importIssues(
        {} as any,
        mockUser,
        [{ partName: 'Part' }],
      );

      expect(result.successCount).toBe(0);
      expect(buildImportRowError).toHaveBeenCalled();
    });

    it('should record row error when upsert throws', async () => {
      const { buildImportRowError, buildImportSummary } = await import(
        '~/modules/file-storage/import-report'
      );
      const { buildInspectionIssueUpsertPayload } = await import(
        '~/modules/inspection/inspection-issue'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;

      vi.mocked(buildInspectionIssueUpsertPayload).mockResolvedValue({
        where: { workOrderNumber: 'WO-1' },
        create: {},
        update: {},
      } as any);
      (prisma.quality_records.upsert as any).mockRejectedValue(
        new Error('duplicate'),
      );
      vi.mocked(buildImportSummary).mockReturnValue({
        errorCount: 1,
        errors: [{ reason: 'error', row: 1 }],
        successCount: 0,
        totalCount: 1,
      } as any);

      await InspectionIssueMutationService.importIssues({} as any, mockUser, [
        { workOrderNumber: 'WO-1' },
      ]);

      expect(buildImportRowError).toHaveBeenCalled();
    });

    it('should resolve successfully and log error when welder sync throws in importIssues', async () => {
      const { WelderScoreService } = await import(
        '~/modules/welder/welder-score.service'
      );
      const { buildInspectionIssueUpsertPayload } = await import(
        '~/modules/inspection/inspection-issue'
      );
      const { buildImportSummary } = await import(
        '~/modules/file-storage/import-report'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;

      vi.mocked(buildInspectionIssueUpsertPayload).mockResolvedValue({
        where: { workOrderNumber: 'WO-2' },
        create: { partName: 'Part' },
        update: { partName: 'Part' },
      } as any);
      (prisma.quality_records.upsert as any).mockResolvedValue({
        id: 'ISS-2026-010',
        supplierName: 'Supplier A',
      });
      vi.mocked(buildImportSummary).mockReturnValue({
        errorCount: 0,
        errors: [],
        successCount: 1,
        totalCount: 1,
      } as any);
      const syncError = new Error('welder import sync failed');
      vi.mocked(WelderScoreService.syncFromInspectionIssues).mockRejectedValue(
        syncError,
      );

      const result = await InspectionIssueMutationService.importIssues(
        {} as any,
        mockUser,
        [{ workOrderNumber: 'WO-2', partName: 'Part' }],
      );

      expect(result.successCount).toBe(1);
      expect(mockLoggerFns.error).toHaveBeenCalledWith(
        syncError,
        'welder-score-sync after importIssues',
      );
    });
  });
});
