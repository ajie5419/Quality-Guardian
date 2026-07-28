import type { inspection_result } from '@prisma/client';

import type { InspectionRecordInput } from './inspection-record-types';

import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import { BusinessError } from '~/utils/business-error';
import { eventBus } from '~/utils/event-bus';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';
import prisma from '~/utils/prisma';
import {
  resolveCanonicalProcessNameById,
  resolveProcessIdForWrite,
} from '~/utils/process-resolver';

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

    const result = await prisma.$transaction(async (tx) => {
      const previousInspection = await tx.inspections.findUnique({
        where: { id },
        select: {
          category: true,
          incomingType: true,
          partId: true,
          partName: true,
          processId: true,
          processName: true,
          supplierName: true,
          supplierId: true,
          team: true,
          teamId: true,
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
      const inspectionCategory =
        data.category || previousInspection?.category || 'PROCESS';
      const teamIdentityChanged =
        data.teamId !== undefined || data.team !== undefined;
      const explicitTeamId = String(data.teamId || '').trim();
      if (
        inspectionCategory === 'PROCESS' &&
        teamIdentityChanged &&
        !explicitTeamId
      ) {
        throw new BusinessError(
          'TEAM_ID_REQUIRED',
          'A canonical TEAM identity is required for process inspections',
        );
      }
      const teamIdForResolution =
        inspectionCategory === 'PROCESS'
          ? explicitTeamId || previousInspection?.teamId
          : null;
      if (inspectionCategory === 'PROCESS' && !teamIdForResolution) {
        throw new BusinessError(
          'TEAM_ID_REQUIRED',
          'A canonical TEAM identity is required for process inspections',
        );
      }
      const teamIdentity = teamIdForResolution
        ? await SupplierIdentityService.resolveTeamById(teamIdForResolution)
        : null;
      const governedFields = buildGovernedWriteFieldsForTable('inspections', {
        incomingType: data.incomingType,
        materialName: data.materialName,
        partName: data.partName,
        processName: data.processName,
        projectName: data.projectName,
        supplierName: data.supplierName,
        team: teamIdentity?.name ?? null,
      });
      const governedCanonicalIds =
        await buildGovernedCanonicalWritePairForTable('inspections', {
          ...governedFields,
          partId: data.partId,
          supplierId: data.supplierId,
        });
      const governedSupplierId =
        typeof governedCanonicalIds.supplierId === 'string'
          ? governedCanonicalIds.supplierId
          : data.supplierId;
      const supplierIdForResolution =
        governedSupplierId === undefined && data.supplierName === undefined
          ? previousInspection?.supplierId
          : governedSupplierId;
      const supplierIdentity =
        await SupplierIdentityService.resolveSupplierForInspection({
          category: inspectionCategory,
          supplierId: supplierIdForResolution,
          teamId: teamIdForResolution,
        });
      if (inspectionCategory === 'INCOMING' && !supplierIdentity) {
        throw new BusinessError(
          'SUPPLIER_ID_REQUIRED',
          'A canonical supplier identity is required for incoming inspections',
        );
      }
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
          teamId: teamIdentity?.id ?? null,
          level1Component: data.level1Component,
          level2Component: data.level2Component,
          ...governedFields,
          ...governedCanonicalIds,
          supplierId: supplierIdentity?.id ?? null,
          supplierName: supplierIdentity?.name ?? null,
          documents: data.documents,
          hasDocuments: data.hasDocuments,
          selfCheckDocuments: data.selfCheckDocuments,
          hasSelfCheckDocuments: data.hasSelfCheckDocuments,
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
      await FileStorageService.registerReferencesFromAttachments({
        attachments: inspection.selfCheckDocuments,
        bizId: String(inspection.id),
        bizType: 'inspection_record',
        fieldName: 'selfCheckDocuments',
      });

      return { inspection, previousInspection };
    });
    eventBus.emit('inspection_record.changed', {
      supplierIds: [
        result.previousInspection?.supplierId,
        result.inspection.supplierId,
      ],
      supplierNames: [
        result.previousInspection?.supplierName,
        result.inspection.supplierName,
      ],
      teamIds: [result.previousInspection?.teamId, result.inspection.teamId],
      teamNames: [result.previousInspection?.team, result.inspection.team],
    });
    return result.inspection;
  },
};
