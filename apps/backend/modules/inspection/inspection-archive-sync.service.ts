import type { archive_task_status } from '@prisma/client';

import { Prisma } from '@prisma/client';
import { buildGovernedWriteFieldsForTable } from '~/governance/master-data/master-data-governance-write';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { createModuleLogger } from '~/utils/logger';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';

const logger = createModuleLogger('InspectionService');

type InspectionArchiveTaskSyncSource = {
  documents?: null | string;
  hasDocuments?: boolean;
  id: string;
  inspectionDate?: Date | null;
  inspector: string;
  projectName?: null | string;
  remarks?: null | string;
  result?: null | string;
  workOrderNumber: string;
};

function resolveArchiveDueAt(inspectionDate?: Date | null) {
  const dueAt = new Date(inspectionDate || new Date());
  dueAt.setHours(23, 59, 59, 999);
  return dueAt;
}

function shouldRequireArchiveTask(source: InspectionArchiveTaskSyncSource) {
  return (
    Boolean(source.hasDocuments) ||
    Boolean(String(source.documents || '').trim()) ||
    String(source.result || '')
      .trim()
      .toUpperCase() === 'FAIL'
  );
}

function buildArchiveWorkContent(source: InspectionArchiveTaskSyncSource) {
  const remarks = String(source.remarks || '').trim();
  if (remarks) {
    return remarks;
  }
  const datePart = (source.inspectionDate || new Date())
    .toISOString()
    .slice(0, 10);
  return `${datePart} 检验资料归档`;
}

export async function syncInspectionArchiveTask(
  tx: Prisma.TransactionClient,
  source: InspectionArchiveTaskSyncSource,
) {
  try {
    if (!shouldRequireArchiveTask(source)) {
      const tasks = await tx.inspection_archive_tasks.findMany({
        select: { id: true },
        where: { inspectionId: source.id },
      });
      await tx.inspection_archive_tasks.deleteMany({
        where: { inspectionId: source.id },
      });
      await Promise.all(
        tasks.map((task) =>
          FileStorageService.softDeleteReferences({
            bizId: task.id,
            bizType: 'inspection_archive_task',
          }),
        ),
      );
      return;
    }

    const existing = await tx.inspection_archive_tasks.findUnique({
      where: { inspectionId: source.id },
      select: {
        archivedAt: true,
        status: true,
      },
    });

    const dueAt = resolveArchiveDueAt(source.inspectionDate);
    const hasAttachments = Boolean(String(source.documents || '').trim());
    const preferredStatus: archive_task_status = hasAttachments
      ? 'ARCHIVED'
      : 'PENDING';
    let status: archive_task_status = preferredStatus;
    if (existing?.status === 'ARCHIVED') {
      status = 'ARCHIVED';
    }
    const archivedAt =
      status === 'ARCHIVED' ? existing?.archivedAt || new Date() : null;
    const now = new Date();

    const governedFields = buildGovernedWriteFieldsForTable(
      'inspection_archive_tasks',
      {
        projectName: source.projectName,
      },
    );
    const task = await tx.inspection_archive_tasks.upsert({
      where: { inspectionId: source.id },
      update: {
        archivedAt,
        attachments: source.documents || null,
        dueAt,
        inspectionDate: source.inspectionDate || now,
        inspector: source.inspector,
        isOverdue: status !== 'ARCHIVED' && now > dueAt,
        ...governedFields,
        status,
        workContent: buildArchiveWorkContent(source),
        workOrderNumber: source.workOrderNumber,
      },
      create: {
        attachments: source.documents || null,
        dueAt,
        inspectionDate: source.inspectionDate || now,
        inspector: source.inspector,
        isOverdue: status !== 'ARCHIVED' && now > dueAt,
        ...governedFields,
        status,
        workContent: buildArchiveWorkContent(source),
        workOrderNumber: source.workOrderNumber,
        inspectionId: source.id,
        archivedAt,
      },
    });
    await FileStorageService.registerReferencesFromAttachments({
      attachments: source.documents,
      bizId: String(task.id),
      bizType: 'inspection_archive_task',
      fieldName: 'attachments',
    });
  } catch (error) {
    if (isPrismaSchemaMismatchError(error)) {
      logger.warn('Skip inspection archive-task sync: schema not ready');
      return;
    }
    throw error;
  }
}
