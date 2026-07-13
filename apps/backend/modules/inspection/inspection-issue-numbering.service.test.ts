import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionIssueNumberingService } from '~/modules/inspection/inspection-issue-numbering.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    quality_records: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    softDeleteReferences: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: {
    auditLog: vi.fn(),
  },
}));

vi.mock('~/modules/welder/welder-score.service', () => ({
  WelderScoreService: {
    syncFromInspectionIssues: vi.fn(),
  },
}));

describe('inspectionIssueNumberingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.quality_records.updateMany as any).mockResolvedValue({ count: 1 });
  });

  describe('generateNextNcNumber', () => {
    it('should return NC-YYKJ-001 when no existing records', async () => {
      (prisma.quality_records.findFirst as any).mockResolvedValue(null);

      const result =
        await InspectionIssueNumberingService.generateNextNcNumber();

      const yearShort = new Date().getFullYear().toString().slice(-2);
      expect(result).toBe(`NC-${yearShort}KJ-001`);
      expect(prisma.quality_records.findFirst).toHaveBeenCalledWith({
        where: {
          nonConformanceNumber: {
            startsWith: `NC-${yearShort}KJ-`,
          },
        },
        orderBy: {
          nonConformanceNumber: 'desc',
        },
        select: {
          nonConformanceNumber: true,
        },
      });
    });

    it('should increment sequence from last record', async () => {
      const yearShort = new Date().getFullYear().toString().slice(-2);
      (prisma.quality_records.findFirst as any).mockResolvedValue({
        nonConformanceNumber: `NC-${yearShort}KJ-005`,
      });

      const result =
        await InspectionIssueNumberingService.generateNextNcNumber();

      expect(result).toBe(`NC-${yearShort}KJ-006`);
    });

    it('should pad sequence to 3 digits', async () => {
      const yearShort = new Date().getFullYear().toString().slice(-2);
      (prisma.quality_records.findFirst as any).mockResolvedValue({
        nonConformanceNumber: `NC-${yearShort}KJ-099`,
      });

      const result =
        await InspectionIssueNumberingService.generateNextNcNumber();

      expect(result).toBe(`NC-${yearShort}KJ-100`);
    });

    it('should handle last record with invalid sequence', async () => {
      const yearShort = new Date().getFullYear().toString().slice(-2);
      (prisma.quality_records.findFirst as any).mockResolvedValue({
        nonConformanceNumber: `NC-${yearShort}KJ-INVALID`,
      });

      const result =
        await InspectionIssueNumberingService.generateNextNcNumber();

      expect(result).toBe(`NC-${yearShort}KJ-001`);
    });
  });

  describe('deleteRecord', () => {
    it('should soft delete record and sync welder scores', async () => {
      const { FileStorageService } = await import(
        '~/modules/file-storage/file-storage.service'
      );
      const { SystemLogService } = await import(
        '~/modules/system-log/system-log.service'
      );
      const { WelderScoreService } = await import(
        '~/modules/welder/welder-score.service'
      );

      await InspectionIssueNumberingService.deleteRecord('rec-1', 'user-1');

      expect(prisma.quality_records.updateMany).toHaveBeenCalledWith({
        where: { createdBy: 'user-1', id: 'rec-1', isDeleted: false },
        data: {
          isDeleted: true,
          updatedAt: expect.any(Date),
        },
      });
      expect(FileStorageService.softDeleteReferences).toHaveBeenCalledWith({
        bizId: 'rec-1',
        bizType: 'inspection_issue',
      });
      expect(WelderScoreService.syncFromInspectionIssues).toHaveBeenCalled();
      expect(SystemLogService.auditLog).toHaveBeenCalledWith(
        'inspection',
        'issueDelete',
        {
          userId: 'user-1',
          targetId: 'rec-1',
          detailsVariables: {},
        },
      );
    });

    it('returns not found when the record was already deleted', async () => {
      (prisma.quality_records.updateMany as any).mockResolvedValue({
        count: 0,
      });

      await expect(
        InspectionIssueNumberingService.deleteRecord('rec-1', 'user-1'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', httpStatus: 404 });
    });
  });
});
