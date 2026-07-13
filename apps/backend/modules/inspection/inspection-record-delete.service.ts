import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { eventBus } from '~/utils/event-bus';
import prisma from '~/utils/prisma';
import { resolveCanonicalProcessName as resolveCanonicalProcessNameByRelation } from '~/utils/process-resolver';

import { syncInspectionProjectDocuments } from './inspection-project-document-sync.service';

export const InspectionRecordDeleteService = {
  async delete(id: string) {
    const result = await prisma.$transaction(async (tx) => {
      const inspection = await tx.inspections.findUnique({
        where: { id },
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
          team: true,
          workOrderNumber: true,
        },
      });

      const deleted = await tx.inspections.update({
        where: { id },
        data: { isDeleted: true },
      });

      if (inspection) {
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

      await FileStorageService.softDeleteReferences({
        bizId: id,
        bizType: 'inspection_record',
      });

      return { deleted, inspection };
    });
    eventBus.emit('inspection_record.changed', {
      supplierNames: [result.inspection?.supplierName],
      teamNames: [result.inspection?.team],
    });
    return result.deleted;
  },
  async batchDelete(ids: string[]) {
    const result = await prisma.$transaction(async (tx) => {
      const inspections = await tx.inspections.findMany({
        where: { id: { in: ids } },
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
          team: true,
          workOrderNumber: true,
        },
      });

      const deleted = await tx.inspections.updateMany({
        where: { id: { in: ids } },
        data: { isDeleted: true },
      });

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

      return { deleted, inspections };
    });
    eventBus.emit('inspection_record.changed', {
      supplierNames: result.inspections.map((item) => item.supplierName),
      teamNames: result.inspections.map((item) => item.team),
    });
    return result.deleted;
  },
};
