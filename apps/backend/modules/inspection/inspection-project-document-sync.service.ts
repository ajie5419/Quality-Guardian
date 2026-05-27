import { Prisma } from '@prisma/client';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import {
  parseProjectDocuments,
  stringifyProjectDocuments,
  upsertInspectionProjectDocuments,
} from '~/modules/inspection/project-documents';
import { buildGovernedWriteFieldsForTable } from '~/utils/governed-write';
import { createModuleLogger } from '~/utils/logger';
import { isPrismaMissingColumnError } from '~/utils/prisma-error';

const logger = createModuleLogger('InspectionService');

type InspectionProjectDocSyncSource = {
  category?: string;
  documents?: null | string;
  hasDocuments?: boolean;
  id: string;
  incomingType?: null | string;
  level1Component?: null | string;
  level2Component?: null | string;
  materialName?: null | string;
  processName?: null | string;
  projectName?: null | string;
  result?: null | string;
  workOrderNumber: string;
};

export async function syncInspectionProjectDocuments(
  tx: Prisma.TransactionClient,
  source: InspectionProjectDocSyncSource,
) {
  try {
    // governance-allow-direct-canonical-read: project-doc sync reads project label for compatibility.
    const currentProject = await tx.doc_projects.findUnique({
      where: { workOrderNumber: source.workOrderNumber },
      select: {
        documents: true,
        id: true,
        projectName: true,
      },
    });

    const nextDocuments = upsertInspectionProjectDocuments(
      parseProjectDocuments(currentProject?.documents),
      source,
    );

    if (currentProject) {
      const governedProjectFields = buildGovernedWriteFieldsForTable(
        'doc_projects',
        {
          projectName: source.projectName || currentProject.projectName,
        },
      );
      await tx.doc_projects.update({
        where: { id: currentProject.id },
        data: {
          documents: stringifyProjectDocuments(nextDocuments),
          projectName: source.projectName || currentProject.projectName,
          ...governedProjectFields,
          updatedAt: new Date(),
        },
      });
      await FileStorageService.registerReferencesFromAttachments({
        attachments: stringifyProjectDocuments(nextDocuments),
        bizId: String(currentProject.id),
        bizType: 'doc_project',
        fieldName: 'documents',
      });
      return;
    }

    if (nextDocuments.length === 0) {
      return;
    }

    const createProjectName = source.projectName || source.workOrderNumber;
    const governedProjectFields = buildGovernedWriteFieldsForTable(
      'doc_projects',
      {
        projectName: createProjectName,
      },
    );
    const created = await tx.doc_projects.create({
      data: {
        documents: stringifyProjectDocuments(nextDocuments),
        projectName: createProjectName,
        ...governedProjectFields,
        status: 'active',
        workOrderNumber: source.workOrderNumber,
      },
    });
    await FileStorageService.registerReferencesFromAttachments({
      attachments: stringifyProjectDocuments(nextDocuments),
      bizId: String(created.id),
      bizType: 'doc_project',
      fieldName: 'documents',
    });
  } catch (error) {
    if (isPrismaMissingColumnError(error)) {
      logger.warn(
        'Skip inspection project-doc sync: doc_projects.documents missing',
      );
      return;
    }
    throw error;
  }
}
