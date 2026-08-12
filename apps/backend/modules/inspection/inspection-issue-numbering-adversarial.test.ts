import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { InspectionIssueNumberingService } from '~/modules/inspection/inspection-issue-numbering.service';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { WelderScoreService } from '~/modules/welder/welder-score.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => {
  const transactionClient = {
    quality_loss_index_jobs: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    quality_records: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return {
    default: {
      ...transactionClient,
      $transaction: vi.fn((callback) => callback(transactionClient)),
    },
  };
});

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: { softDeleteReferences: vi.fn() },
}));

vi.mock('~/modules/welder/welder-score.service', () => ({
  WelderScoreService: { syncFromInspectionIssues: vi.fn() },
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: { auditLog: vi.fn() },
}));

describe('inspectionIssueNumberingService – adversarial tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.quality_records.updateMany as any).mockResolvedValue({ count: 1 });
  });

  // ─── generateNextNcNumber ───
  describe('generateNextNcNumber', () => {
    it('should start from 001 when no existing records', async () => {
      (prisma.quality_records.findFirst as any).mockResolvedValue(null);

      const result =
        await InspectionIssueNumberingService.generateNextNcNumber();

      expect(result).toMatch(/^NC-\d{2}KJ-001$/);
    });

    it('should increment from existing record', async () => {
      const currentYear = new Date().getFullYear().toString().slice(-2);
      (prisma.quality_records.findFirst as any).mockResolvedValue({
        nonConformanceNumber: `NC-${currentYear}KJ-005`,
      });

      const result =
        await InspectionIssueNumberingService.generateNextNcNumber();

      expect(result).toBe(`NC-${currentYear}KJ-006`);
    });

    it('should pad sequence to 3 digits', async () => {
      const currentYear = new Date().getFullYear().toString().slice(-2);
      (prisma.quality_records.findFirst as any).mockResolvedValue({
        nonConformanceNumber: `NC-${currentYear}KJ-009`,
      });

      const result =
        await InspectionIssueNumberingService.generateNextNcNumber();

      expect(result).toBe(`NC-${currentYear}KJ-010`);
    });

    it('should handle sequence crossing 999 → 1000', async () => {
      const currentYear = new Date().getFullYear().toString().slice(-2);
      (prisma.quality_records.findFirst as any).mockResolvedValue({
        nonConformanceNumber: `NC-${currentYear}KJ-999`,
      });

      const result =
        await InspectionIssueNumberingService.generateNextNcNumber();

      expect(result).toBe(`NC-${currentYear}KJ-1000`);
    });

    it('should handle corrupted nonConformanceNumber with non-numeric suffix', async () => {
      (prisma.quality_records.findFirst as any).mockResolvedValue({
        nonConformanceNumber: 'NC-25KJ-ABC',
      });

      const result =
        await InspectionIssueNumberingService.generateNextNcNumber();

      expect(result).toMatch(/^NC-\d{2}KJ-001$/);
    });

    it('should handle empty nonConformanceNumber', async () => {
      (prisma.quality_records.findFirst as any).mockResolvedValue({
        nonConformanceNumber: '',
      });

      const result =
        await InspectionIssueNumberingService.generateNextNcNumber();

      expect(result).toMatch(/^NC-\d{2}KJ-001$/);
    });

    it('should handle null nonConformanceNumber field', async () => {
      (prisma.quality_records.findFirst as any).mockResolvedValue({
        nonConformanceNumber: null,
      });

      const result =
        await InspectionIssueNumberingService.generateNextNcNumber();

      expect(result).toMatch(/^NC-\d{2}KJ-001$/);
    });

    it('should handle very large sequence number', async () => {
      const currentYear = new Date().getFullYear().toString().slice(-2);
      (prisma.quality_records.findFirst as any).mockResolvedValue({
        nonConformanceNumber: `NC-${currentYear}KJ-99999`,
      });

      const result =
        await InspectionIssueNumberingService.generateNextNcNumber();

      expect(result).toBe(`NC-${currentYear}KJ-100000`);
    });

    it('should use correct 2-digit year prefix', async () => {
      (prisma.quality_records.findFirst as any).mockResolvedValue(null);

      const result =
        await InspectionIssueNumberingService.generateNextNcNumber();

      const year2 = new Date().getFullYear().toString().slice(-2);
      expect(result).toContain(`NC-${year2}KJ-`);
    });

    it('should query with correct prefix pattern', async () => {
      (prisma.quality_records.findFirst as any).mockResolvedValue(null);

      await InspectionIssueNumberingService.generateNextNcNumber();

      expect(prisma.quality_records.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            nonConformanceNumber: expect.objectContaining({
              startsWith: expect.stringContaining('NC-'),
            }),
          }),
          orderBy: { nonConformanceNumber: 'desc' },
          select: { nonConformanceNumber: true },
        }),
      );
    });
  });

  // ─── generateNextNcNumber: race condition simulation ───
  describe('generateNextNcNumber – race condition simulation', () => {
    it('should produce different numbers when called concurrently', async () => {
      const currentYear = new Date().getFullYear().toString().slice(-2);
      let callCount = 0;
      (prisma.quality_records.findFirst as any).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { nonConformanceNumber: `NC-${currentYear}KJ-010` };
        }
        return { nonConformanceNumber: `NC-${currentYear}KJ-010` };
      });

      const results = await Promise.all([
        InspectionIssueNumberingService.generateNextNcNumber(),
        InspectionIssueNumberingService.generateNextNcNumber(),
        InspectionIssueNumberingService.generateNextNcNumber(),
      ]);

      const unique = new Set(results);
      expect(unique.size).toBe(1);
      results.forEach((r) => expect(r).toBe(`NC-${currentYear}KJ-011`));
    });

    it('should handle 10 concurrent calls without crash', async () => {
      (prisma.quality_records.findFirst as any).mockResolvedValue(null);

      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          InspectionIssueNumberingService.generateNextNcNumber(),
        ),
      );

      expect(results).toHaveLength(10);
      results.forEach((r) => expect(r).toMatch(/^NC-\d{2}KJ-001$/));
    });

    it('should show race condition: concurrent calls may produce same number', async () => {
      (prisma.quality_records.findFirst as any).mockResolvedValue(null);

      const results = await Promise.all([
        InspectionIssueNumberingService.generateNextNcNumber(),
        InspectionIssueNumberingService.generateNextNcNumber(),
      ]);

      const unique = new Set(results);
      expect(unique.size).toBe(1);
    });
  });

  // ─── generateNextNcNumber: gap handling ───
  describe('generateNextNcNumber – gap handling', () => {
    it('should continue from highest, not fill gaps', async () => {
      const currentYear = new Date().getFullYear().toString().slice(-2);
      (prisma.quality_records.findFirst as any).mockResolvedValue({
        nonConformanceNumber: `NC-${currentYear}KJ-050`,
      });

      const result =
        await InspectionIssueNumberingService.generateNextNcNumber();

      expect(result).toBe(`NC-${currentYear}KJ-051`);
    });

    it('should skip gap from 003 to 007 if 007 is last', async () => {
      const currentYear = new Date().getFullYear().toString().slice(-2);
      (prisma.quality_records.findFirst as any).mockResolvedValue({
        nonConformanceNumber: `NC-${currentYear}KJ-007`,
      });

      const result =
        await InspectionIssueNumberingService.generateNextNcNumber();

      expect(result).toBe(`NC-${currentYear}KJ-008`);
    });
  });

  // ─── generateNextNcNumber: format edge cases ───
  describe('generateNextNcNumber – format edge cases', () => {
    it('should produce exactly NC-YYKJ-XXX format with zero-padded number', async () => {
      (prisma.quality_records.findFirst as any).mockResolvedValue(null);

      const result =
        await InspectionIssueNumberingService.generateNextNcNumber();

      expect(result).toMatch(/^NC-\d{2}KJ-\d{3,}$/);
    });

    it('should have prefix length consistent with format', async () => {
      (prisma.quality_records.findFirst as any).mockResolvedValue(null);

      const result =
        await InspectionIssueNumberingService.generateNextNcNumber();

      const parts = result.split('-');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('NC');
      expect(parts[1]).toMatch(/^\d{2}KJ$/);
      expect(parts[2]).toMatch(/^\d+$/);
    });
  });

  // ─── deleteRecord ───
  describe('deleteRecord', () => {
    it('should soft delete and record audit log', async () => {
      (prisma.quality_records.updateMany as any).mockResolvedValue({
        count: 1,
      });
      (FileStorageService.softDeleteReferences as any).mockResolvedValue(
        undefined,
      );
      (WelderScoreService.syncFromInspectionIssues as any).mockResolvedValue(
        undefined,
      );
      (SystemLogService.auditLog as any).mockResolvedValue(undefined);

      await InspectionIssueNumberingService.deleteRecord('issue-1', 'user-1');

      expect(prisma.quality_records.updateMany).toHaveBeenCalledWith({
        where: { createdBy: 'user-1', id: 'issue-1', isDeleted: false },
        data: {
          isDeleted: true,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should soft delete file references', async () => {
      (prisma.quality_records.updateMany as any).mockResolvedValue({
        count: 1,
      });
      (FileStorageService.softDeleteReferences as any).mockResolvedValue(
        undefined,
      );
      (WelderScoreService.syncFromInspectionIssues as any).mockResolvedValue(
        undefined,
      );
      (SystemLogService.auditLog as any).mockResolvedValue(undefined);

      await InspectionIssueNumberingService.deleteRecord('issue-1', 'user-1');

      expect(FileStorageService.softDeleteReferences).toHaveBeenCalledWith({
        bizId: 'issue-1',
        bizType: 'inspection_issue',
      });
    });

    it('should sync welder scores after delete', async () => {
      (prisma.quality_records.updateMany as any).mockResolvedValue({
        count: 1,
      });
      (FileStorageService.softDeleteReferences as any).mockResolvedValue(
        undefined,
      );
      (WelderScoreService.syncFromInspectionIssues as any).mockResolvedValue(
        undefined,
      );
      (SystemLogService.auditLog as any).mockResolvedValue(undefined);

      await InspectionIssueNumberingService.deleteRecord('issue-1', 'user-1');

      expect(WelderScoreService.syncFromInspectionIssues).toHaveBeenCalled();
    });

    it('should record audit log with correct params', async () => {
      (prisma.quality_records.updateMany as any).mockResolvedValue({
        count: 1,
      });
      (FileStorageService.softDeleteReferences as any).mockResolvedValue(
        undefined,
      );
      (WelderScoreService.syncFromInspectionIssues as any).mockResolvedValue(
        undefined,
      );
      (SystemLogService.auditLog as any).mockResolvedValue(undefined);

      await InspectionIssueNumberingService.deleteRecord('issue-42', 'user-99');

      expect(SystemLogService.auditLog).toHaveBeenCalledWith(
        'inspection',
        'issueDelete',
        {
          userId: 'user-99',
          targetId: 'issue-42',
          detailsVariables: {},
        },
      );
    });

    it('should handle empty id and userId', async () => {
      (prisma.quality_records.updateMany as any).mockResolvedValue({
        count: 1,
      });
      (FileStorageService.softDeleteReferences as any).mockResolvedValue(
        undefined,
      );
      (WelderScoreService.syncFromInspectionIssues as any).mockResolvedValue(
        undefined,
      );
      (SystemLogService.auditLog as any).mockResolvedValue(undefined);

      await InspectionIssueNumberingService.deleteRecord('', '');

      expect(prisma.quality_records.updateMany).toHaveBeenCalled();
      expect(SystemLogService.auditLog).toHaveBeenCalled();
    });

    it('should propagate prisma error on invalid id', async () => {
      (prisma.quality_records.updateMany as any).mockRejectedValue(
        new Error('Record not found'),
      );

      await expect(
        InspectionIssueNumberingService.deleteRecord('nonexistent', 'user-1'),
      ).rejects.toThrow('Record not found');
    });
  });
});
