import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionRecordDeleteService } from '~/modules/inspection/inspection-record-delete.service';
import { eventBus } from '~/utils/event-bus';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn(),
  },
}));

vi.mock('~/utils/event-bus', () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    softDeleteReferences: vi.fn(),
  },
}));

vi.mock('~/utils/process-resolver', () => ({
  resolveCanonicalProcessName: vi.fn().mockReturnValue('Welding'),
}));

vi.mock(
  '~/modules/inspection/inspection-project-document-sync.service',
  () => ({
    syncInspectionProjectDocuments: vi.fn(),
  }),
);

describe('inspectionRecordDeleteService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('delete', () => {
    it('should soft delete inspection and clean up archive tasks', async () => {
      const { FileStorageService } = await import(
        '~/modules/file-storage/file-storage.service'
      );
      const inspection = {
        category: 'PROCESS',
        documents: null,
        hasDocuments: false,
        id: 'i-1',
        incomingType: null,
        level1Component: null,
        level2Component: null,
        materialName: null,
        process: { name: 'Welding' },
        processName: 'Welding',
        projectName: null,
        result: 'PASS',
        supplierId: 'supplier-1',
        supplierName: 'Supplier A',
        team: null,
        teamId: 'team-1',
        workOrderNumber: 'WO-1',
      };
      const txFindUnique = vi.fn().mockResolvedValue(inspection);
      const txUpdate = vi.fn().mockResolvedValue({ id: 'i-1' });
      const txFindMany = vi.fn().mockResolvedValue([{ id: 'task-1' }]);
      const txDeleteMany = vi.fn().mockResolvedValue({ count: 1 });

      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb({
          inspections: {
            findUnique: txFindUnique,
            update: txUpdate,
          },
          inspection_archive_tasks: {
            findMany: txFindMany,
            deleteMany: txDeleteMany,
          },
        }),
      );

      const _result = await InspectionRecordDeleteService.delete('i-1');

      expect(txFindUnique).toHaveBeenCalledWith({
        where: { id: 'i-1' },
        select: expect.any(Object),
      });
      expect(txUpdate).toHaveBeenCalledWith({
        where: { id: 'i-1' },
        data: { isDeleted: true },
      });
      expect(txDeleteMany).toHaveBeenCalledWith({
        where: { inspectionId: 'i-1' },
      });
      expect(FileStorageService.softDeleteReferences).toHaveBeenCalledWith({
        bizId: 'i-1',
        bizType: 'inspection_record',
      });
      expect(eventBus.emit).toHaveBeenCalledWith('inspection_record.changed', {
        supplierIds: ['supplier-1'],
        supplierNames: ['Supplier A'],
        teamIds: ['team-1'],
        teamNames: [null],
      });
    });

    it('should handle missing inspection gracefully', async () => {
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb({
          inspections: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn().mockResolvedValue({ id: 'i-1' }),
          },
          inspection_archive_tasks: {
            findMany: vi.fn(),
            deleteMany: vi.fn(),
          },
        }),
      );

      const result = await InspectionRecordDeleteService.delete('i-1');

      expect(result).toEqual({ id: 'i-1' });
      expect(eventBus.emit).toHaveBeenCalledWith('inspection_record.changed', {
        supplierIds: [undefined],
        supplierNames: [undefined],
        teamIds: [undefined],
        teamNames: [undefined],
      });
    });
  });

  describe('batchDelete', () => {
    it('should soft delete multiple inspections', async () => {
      const { FileStorageService } = await import(
        '~/modules/file-storage/file-storage.service'
      );
      const inspections = [
        {
          category: 'PROCESS',
          documents: null,
          hasDocuments: false,
          id: 'i-1',
          incomingType: null,
          level1Component: null,
          level2Component: null,
          materialName: null,
          process: { name: 'Welding' },
          processName: 'Welding',
          projectName: null,
          result: 'PASS',
          supplierId: 'supplier-1',
          supplierName: null,
          team: 'Outsourcing Team A',
          teamId: 'team-1',
          workOrderNumber: 'WO-1',
        },
      ];
      const txFindMany = vi.fn().mockResolvedValue(inspections);
      const txUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
      const txArchiveFindMany = vi.fn().mockResolvedValue([]);
      const txArchiveDeleteMany = vi.fn();

      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb({
          inspections: {
            findMany: txFindMany,
            updateMany: txUpdateMany,
          },
          inspection_archive_tasks: {
            findMany: txArchiveFindMany,
            deleteMany: txArchiveDeleteMany,
          },
        }),
      );

      const _result = await InspectionRecordDeleteService.batchDelete(['i-1']);

      expect(txUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ['i-1'] } },
        data: { isDeleted: true },
      });
      expect(FileStorageService.softDeleteReferences).toHaveBeenCalled();
      expect(eventBus.emit).toHaveBeenCalledWith('inspection_record.changed', {
        supplierIds: ['supplier-1'],
        supplierNames: [null],
        teamIds: ['team-1'],
        teamNames: ['Outsourcing Team A'],
      });
    });

    it('should handle empty ids array', async () => {
      const txFindMany = vi.fn().mockResolvedValue([]);
      const txUpdateMany = vi.fn().mockResolvedValue({ count: 0 });

      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb({
          inspections: {
            findMany: txFindMany,
            updateMany: txUpdateMany,
          },
          inspection_archive_tasks: {
            findMany: vi.fn(),
            deleteMany: vi.fn(),
          },
        }),
      );

      const _result = await InspectionRecordDeleteService.batchDelete([]);

      expect(txUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: [] } },
        data: { isDeleted: true },
      });
    });

    it('does not publish a change event when the transaction rolls back', async () => {
      const failure = new Error('transaction failed');
      vi.mocked(prisma.$transaction).mockRejectedValue(failure);

      await expect(
        InspectionRecordDeleteService.batchDelete(['i-1']),
      ).rejects.toBe(failure);

      expect(eventBus.emit).not.toHaveBeenCalled();
    });
  });
});
