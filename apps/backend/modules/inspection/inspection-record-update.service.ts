import type { inspection_result } from '@prisma/client';

import type { InspectionRecordInput } from './inspection-record-types';

import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';
import prisma from '~/utils/prisma';
import {
  resolveCanonicalProcessNameById,
  resolveProcessIdForWrite,
} from '~/utils/process-resolver';
import { resolveTeamIdForWrite } from '~/utils/team-resolver';

import { syncInspectionArchiveTask } from './inspection-archive-sync.service';
import { syncInspectionProjectDocuments } from './inspection-project-document-sync.service';
import {
  InspectionRecordRules,
  normalizeOptionalString,
} from './inspection-record-types';
import { resolveInspectionTemplateBinding } from './inspection-template-binding.service';

export const InspectionRecordUpdateService = {
  async update(id: string, data: InspectionRecordInput) {
    const overallResult = InspectionRecordRules.resolveOverallResult(data);
    const quantitySummary = InspectionRecordRules.normalizeQuantitySummary({
      quantity: data.quantity,
      qualifiedQuantity: data.qualifiedQuantity,
      unqualifiedQuantity: data.unqualifiedQuantity,
      result: overallResult,
    });
    InspectionRecordRules.assertResultQuantityConsistency(
      overallResult,
      quantitySummary,
    );

    return prisma.$transaction(async (tx) => {
      const inputTeam = data.team;
      const governedFields = buildGovernedWriteFieldsForTable('inspections', {
        incomingType: data.incomingType,
        materialName: data.materialName,
        processName: data.processName,
        projectName: data.projectName,
        supplierName: data.supplierName,
        team: inputTeam,
      });
      const governedCanonicalIds =
        await buildGovernedCanonicalWritePairForTable(
          'inspections',
          governedFields as Record<string, unknown>,
        );
      const previousInspection = await tx.inspections.findUnique({
        where: { id },
        select: {
          category: true,
          incomingType: true,
          processId: true,
          processName: true,
          templateId: true,
          templateName: true,
          workOrderNumber: true,
        },
      });
      const previousCanonicalProcessName = previousInspection
        ? await resolveCanonicalProcessNameById(
            tx,
            previousInspection.processId,
            previousInspection.processName,
          )
        : null;
      const resolvedProcessId = await resolveProcessIdForWrite({
        explicitProcessId: data.processId,
        keepExistingWhenNameMissing: true,
        processName: data.processName,
      });
      const resolvedTeamId = await resolveTeamIdForWrite({
        explicitTeamId: data.teamId,
        keepExistingWhenNameMissing: true,
        team: inputTeam, // governance-allow-direct-name-id
      });
      const templateProcessId =
        resolvedProcessId === undefined
          ? (previousInspection?.processId ?? undefined)
          : resolvedProcessId;
      const templateBinding = await resolveInspectionTemplateBinding(tx, {
        ...data,
        category: data.category || previousInspection?.category || 'PROCESS',
        incomingType:
          data.incomingType === undefined
            ? previousInspection?.incomingType || undefined
            : data.incomingType,
        processId: templateProcessId,
        processName:
          data.processName === undefined
            ? previousCanonicalProcessName || undefined
            : data.processName,
        workOrderNumber:
          data.workOrderNumber || previousInspection?.workOrderNumber || '',
      });

      // 1. Update Main
      const inspection = await tx.inspections.update({
        where: { id },
        data: {
          workOrderNumber: data.workOrderNumber,
          materialName: data.materialName,
          incomingType: data.incomingType,
          processId: resolvedProcessId,
          teamId: resolvedTeamId, // governance-allow-direct-name-id
          level1Component: data.level1Component,
          level2Component: data.level2Component,
          ...governedFields,
          ...governedCanonicalIds,
          documents: data.documents,
          hasDocuments: data.hasDocuments,
          packingListArchived: data.packingListArchived,
          quantity: quantitySummary.quantity,
          qualifiedQuantity: quantitySummary.qualifiedQuantity,
          unqualifiedQuantity: quantitySummary.unqualifiedQuantity,
          inspector: data.inspector,
          templateId:
            data.templateId === undefined
              ? (templateBinding.templateId ?? previousInspection?.templateId)
              : normalizeOptionalString(data.templateId),
          templateName:
            data.templateName === undefined
              ? (templateBinding.templateName ??
                previousInspection?.templateName)
              : normalizeOptionalString(data.templateName),
          inspectionDate: data.inspectionDate
            ? new Date(data.inspectionDate)
            : undefined,
          reportDate: data.reportDate ? new Date(data.reportDate) : null,
          result: overallResult,
          remarks: data.remarks,
        },
      });

      // 2. Replace Items (Delete all & Create new)
      await tx.inspection_items.deleteMany({
        where: { inspectionId: id },
      });

      if (data.items && data.items.length > 0) {
        await tx.inspection_items.createMany({
          data: data.items.map((item) => ({
            inspectionId: id,
            checkItem: item.checkItem || item.activity,
            standardValue:
              item.standardValue !== undefined && item.standardValue !== null
                ? String(item.standardValue)
                : null,
            upperTolerance:
              item.upperTolerance !== undefined && item.upperTolerance !== null
                ? String(item.upperTolerance)
                : null,
            lowerTolerance:
              item.lowerTolerance !== undefined && item.lowerTolerance !== null
                ? String(item.lowerTolerance)
                : null,
            uom: item.uom || item.unit,
            acceptanceCriteria: item.acceptanceCriteria,
            referenceDoc: item.referenceDoc,
            measuredValue:
              item.measuredValue !== undefined && item.measuredValue !== null
                ? String(item.measuredValue)
                : null,
            result: (item.result as inspection_result) || 'PASS',
            remarks: item.remarks,
            order: item.order || 0,
          })),
        });
      }

      if (
        previousInspection?.workOrderNumber &&
        previousInspection.workOrderNumber !== inspection.workOrderNumber
      ) {
        const canonicalProcessName = await resolveCanonicalProcessNameById(
          tx,
          inspection.processId,
          inspection.processName,
        );
        const normalizedInspection = {
          ...inspection,
          processName: canonicalProcessName,
        };
        await syncInspectionProjectDocuments(tx, {
          ...normalizedInspection,
          hasDocuments: false,
          workOrderNumber: previousInspection.workOrderNumber,
        });
        await syncInspectionProjectDocuments(tx, normalizedInspection);
      } else {
        const canonicalProcessName = await resolveCanonicalProcessNameById(
          tx,
          inspection.processId,
          inspection.processName,
        );
        const normalizedInspection = {
          ...inspection,
          processName: canonicalProcessName,
        };
        await syncInspectionProjectDocuments(tx, normalizedInspection);
      }

      await syncInspectionArchiveTask(tx, inspection);
      await FileStorageService.registerReferencesFromAttachments({
        attachments: inspection.documents,
        bizId: String(inspection.id),
        bizType: 'inspection_record',
        fieldName: 'documents',
      });

      return inspection;
    });
  },
};
