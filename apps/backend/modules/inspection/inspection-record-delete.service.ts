import {
  assertScopedWriteAffected,
  createScopedRepository,
} from '~/modules/data-scope';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';
import { resolveCanonicalProcessName as resolveCanonicalProcessNameByRelation } from '~/utils/process-resolver';

import { syncInspectionProjectDocuments } from './inspection-project-document-sync.service';

export const InspectionRecordDeleteService = {
  async delete(
    id: string,
    access?: {
      scope?: {
        deptIds?: string[];
        scopeType?: 'ALL' | 'DEPT' | 'SELF';
      };
      user?: { id?: number | string; username?: string };
    },
  ) {
    const result = await prisma.$transaction(async (tx) => {
      const txRepo = createScopedRepository('inspection', tx.inspections);
      const accessContext = {
        user: {
          id: access?.user?.id ?? '',
          username: access?.user?.username,
        },
        scope: access?.scope,
      };
      const inspection = await txRepo.findAccessible(
        {
          where: { id, isDeleted: false },
          select: { id: true },
        },
        accessContext,
      );
      if (!inspection) {
        throw new BusinessError('NOT_FOUND', '检验记录不存在', 404);
      }
      const fullInspection = await txRepo.findAccessible(
        {
          where: { id, isDeleted: false },
          select: {
            category: true,
            documents: true,
            hasDocuments: true,
            id: true,
            incomingType: true,
            level1Component: true,
            level2Component: true,
            materialName: true,
            process: {
              select: {
                name: true,
              },
            },
            processName: true,
            projectName: true,
            result: true,
            supplierName: true,
            supplierId: true,
            team: true,
            teamId: true,
            workOrderNumber: true,
          },
        },
        accessContext,
      );

      const deleted = await txRepo.updateAccessible(
        {
          where: { id },
          data: { isDeleted: true },
        },
        accessContext,
      );
      assertScopedWriteAffected(deleted.count, '检验记录');

      const archiveTasks = await tx.inspection_archive_tasks.findMany({
        select: { id: true },
        where: { inspectionId: id },
      });
      const processName =
        resolveCanonicalProcessNameByRelation(fullInspection) || null;
      await syncInspectionProjectDocuments(tx, {
        ...fullInspection,
        hasDocuments: false,
        processName,
      });
      await tx.inspection_archive_tasks.deleteMany({
        where: { inspectionId: id },
      });
      await Promise.all(
        archiveTasks.map((task) =>
          FileStorageService.softDeleteReferences({
            bizId: task.id,
            bizType: 'inspection_archive_task',
          }),
        ),
      );

      await FileStorageService.softDeleteReferences({
        bizId: id,
        bizType: 'inspection_record',
      });
      await MetricRefreshQueue.enqueueSupplierScoresForInspectionIdentities(
        tx,
        {
          supplierIds: [fullInspection?.supplierId],
          teamIds: [fullInspection?.teamId],
        },
        'inspection.deleted',
      );

      return { deleted, inspection: fullInspection };
    });
    return result.deleted;
  },
  async batchDelete(
    ids: string[],
    access?: {
      scope?: {
        deptIds?: string[];
        scopeType?: 'ALL' | 'DEPT' | 'SELF';
      };
      user?: { id?: number | string; username?: string };
    },
  ) {
    const result = await prisma.$transaction(async (tx) => {
      const txRepo = createScopedRepository('inspection', tx.inspections);
      const accessContext = {
        user: {
          id: access?.user?.id ?? '',
          username: access?.user?.username,
        },
        scope: access?.scope,
      };
      const inspections = await txRepo.findManyAccessible(
        {
          where: { id: { in: ids }, isDeleted: false },
          select: {
            category: true,
            documents: true,
            hasDocuments: true,
            id: true,
            incomingType: true,
            level1Component: true,
            level2Component: true,
            materialName: true,
            process: {
              select: {
                name: true,
              },
            },
            processName: true,
            projectName: true,
            result: true,
            supplierName: true,
            supplierId: true,
            team: true,
            teamId: true,
            workOrderNumber: true,
          },
        },
        accessContext,
      );

      const deleted = await txRepo.updateAccessible(
        {
          where: { id: { in: ids } },
          data: { isDeleted: true },
        },
        accessContext,
      );

      for (const inspection of inspections) {
        const archiveTasks = await tx.inspection_archive_tasks.findMany({
          select: { id: true },
          where: { inspectionId: inspection.id },
        });
        const processName =
          resolveCanonicalProcessNameByRelation(inspection) || null;
        await syncInspectionProjectDocuments(tx, {
          ...inspection,
          hasDocuments: false,
          processName,
        });
        await tx.inspection_archive_tasks.deleteMany({
          where: { inspectionId: inspection.id },
        });
        await Promise.all(
          archiveTasks.map((task) =>
            FileStorageService.softDeleteReferences({
              bizId: task.id,
              bizType: 'inspection_archive_task',
            }),
          ),
        );
      }

      await Promise.all(
        ids.map((id) =>
          FileStorageService.softDeleteReferences({
            bizId: id,
            bizType: 'inspection_record',
          }),
        ),
      );
      await MetricRefreshQueue.enqueueSupplierScoresForInspectionIdentities(
        tx,
        {
          supplierIds: inspections.map((item) => item.supplierId),
          teamIds: inspections.map((item) => item.teamId),
        },
        'inspection.batch-deleted',
      );

      return { deleted, inspections };
    });
    return result.deleted;
  },
};
