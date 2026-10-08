import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionRecordDeleteService } from '~/modules/inspection/inspection-record-delete.service';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn(),
  },
}));

vi.mock('~/modules/metric-refresh', () => ({
  MetricRefreshQueue: {
    enqueueSupplierScoresForInspectionIdentities: vi.fn(),
  },
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
      const txFindFirst = vi
        .fn()
        .mockResolvedValueOnce({ id: 'i-1' })
        .mockResolvedValue(inspection);
      const txUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
      const txFindMany = vi.fn().mockResolvedValue([{ id: 'task-1' }]);
      const txDeleteMany = vi.fn().mockResolvedValue({ count: 1 });

      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb({
          inspections: {
            findFirst: txFindFirst,
            updateMany: txUpdateMany,
          },
          inspection_archive_tasks: {
            findMany: txFindMany,
            deleteMany: txDeleteMany,
          },
        }),
      );

      const _result = await InspectionRecordDeleteService.delete('i-1');

      expect(txFindFirst).toHaveBeenCalledWith({
        where: { id: 'i-1', isDeleted: false },
        select: expect.any(Object),
      });
      expect(txUpdateMany).toHaveBeenCalledWith({
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
      expect(
        MetricRefreshQueue.enqueueSupplierScoresForInspectionIdentities,
      ).toHaveBeenCalledWith(
        expect.any(Object),
        {
          supplierIds: ['supplier-1'],
          teamIds: ['team-1'],
        },
        'inspection.deleted',
      );
    });

    it('should handle missing inspection gracefully', async () => {
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb({
          inspections: {
            findFirst: vi.fn().mockResolvedValue(null),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          inspection_archive_tasks: {
            findMany: vi.fn(),
            deleteMany: vi.fn(),
          },
        }),
      );

      await expect(
        InspectionRecordDeleteService.delete('i-1'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(
        MetricRefreshQueue.enqueueSupplierScoresForInspectionIdentities,
      ).not.toHaveBeenCalled();
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

      const result = await InspectionRecordDeleteService.batchDelete(
        ['i-1', 'forbidden', 'missing'],
        { user: { id: 'u-1' }, scope: { scopeType: 'SELF' } },
      );

      expect(result).toEqual({ count: 1 });
      expect(
        vi.mocked(FileStorageService.softDeleteReferences).mock.calls,
      ).toEqual([[{ bizId: 'i-1', bizType: 'inspection_record' }]]);
      expect(
        MetricRefreshQueue.enqueueSupplierScoresForInspectionIdentities,
      ).toHaveBeenCalledWith(
        expect.any(Object),
        {
          supplierIds: ['supplier-1'],
          teamIds: ['team-1'],
        },
        'inspection.batch-deleted',
      );
    });

    it.each([{ ids: [] }, { ids: ['forbidden', 'missing'] }])(
      'does not clean references for inaccessible or empty batches: $ids',
      async ({ ids }) => {
        const { FileStorageService } = await import(
          '~/modules/file-storage/file-storage.service'
        );
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

        const result = await InspectionRecordDeleteService.batchDelete(ids);

        expect(txUpdateMany).toHaveBeenCalledWith({
          where: { id: { in: ids } },
          data: { isDeleted: true },
        });
        expect(result).toEqual({ count: 0 });
        expect(FileStorageService.softDeleteReferences).not.toHaveBeenCalled();
      },
    );

    it('does not publish a change event when the transaction rolls back', async () => {
      const failure = new Error('transaction failed');
      vi.mocked(prisma.$transaction).mockRejectedValue(failure);

      await expect(
        InspectionRecordDeleteService.batchDelete(['i-1']),
      ).rejects.toBe(failure);

      expect(
        MetricRefreshQueue.enqueueSupplierScoresForInspectionIdentities,
      ).not.toHaveBeenCalled();
    });
  });
});
