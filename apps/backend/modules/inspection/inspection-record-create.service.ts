import type { inspection_result, Prisma } from '@prisma/client';

import type {
  InspectionItemInput,
  InspectionRecordInput,
} from './inspection-record-types';

import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import { BusinessError } from '~/utils/business-error';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import {
  resolveCanonicalProcessNameById,
  resolveProcessIdForWrite,
} from '~/utils/process-resolver';

import { syncInspectionArchiveTask } from './inspection-archive-sync.service';
import { syncInspectionProjectDocuments } from './inspection-project-document-sync.service';
import {
  InspectionRecordRules,
  isInspectionSerialNumberConflict,
} from './inspection-record-types';
import { resolveInspectionTemplateBinding } from './inspection-template-binding.service';

const logger = createModuleLogger('InspectionService');

export const InspectionRecordCreateService = {
  async generateSerialNumber(
    client: Pick<Prisma.TransactionClient, 'inspections'> = prisma,
  ): Promise<string> {
    const dateStr = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const prefix = `INS-${dateStr}-`;

    // Find last record today
    const lastRecord = await client.inspections.findFirst({
      where: {
        serialNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        serialNumber: 'desc',
      },
    });

    let seq = 1;
    if (lastRecord && lastRecord.serialNumber) {
      const parts = lastRecord.serialNumber.split('-');
      if (parts.length === 3) {
        seq = (Number.parseInt(parts[2]) || 0) + 1;
      }
    }

    return `${prefix}${String(seq).padStart(3, '0')}`;
  },
  async create(data: InspectionRecordInput, client?: Prisma.TransactionClient) {
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
    // Inside a caller-provided transaction a serial-number conflict must
    // abort the whole transaction, so the caller retries it as one unit.
    const maxRetry = client ? 1 : 5;
    for (let attempt = 1; attempt <= maxRetry; attempt++) {
      try {
        const serialNumber =
          await InspectionRecordCreateService.generateSerialNumber(
            client ?? prisma,
          );
        const resolvedProcessId = await resolveProcessIdForWrite({
          explicitProcessId: data.processId,
          processName: data.processName,
        });
        const explicitTeamId = String(data.teamId || '').trim();
        if (data.category === 'PROCESS' && !explicitTeamId) {
          throw new BusinessError(
            'TEAM_ID_REQUIRED',
            'A canonical TEAM identity is required for process inspections',
          );
        }
        const execute = async (tx: Prisma.TransactionClient) => {
          let teamIdentity = null;
          if (data.category === 'PROCESS') {
            await SupplierIdentityService.lockTeamForMutation(
              explicitTeamId,
              tx,
            );
            teamIdentity = await SupplierIdentityService.resolveTeamById(
              explicitTeamId,
              tx,
            );
          }
          const governedFields = buildGovernedWriteFieldsForTable(
            'inspections',
            {
              incomingType: data.incomingType,
              materialName: data.materialName,
              partName: data.partName,
              processName: data.processName,
              projectName: data.projectName,
              supplierName: data.supplierName,
              team: teamIdentity?.name ?? null,
            },
          );
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
          const supplierIdentity =
            await SupplierIdentityService.resolveSupplierForInspection(
              {
                category: data.category,
                supplierId:
                  data.category === 'PROCESS' ? undefined : governedSupplierId,
                teamId: teamIdentity?.id,
              },
              tx,
            );
          if (data.category === 'INCOMING' && !supplierIdentity) {
            throw new BusinessError(
              'SUPPLIER_ID_REQUIRED',
              'A canonical supplier identity is required for incoming inspections',
            );
          }
          const templateBinding = await resolveInspectionTemplateBinding(
            tx,
            data,
          );
          const inspection = await tx.inspections.create({
            data: {
              serialNumber,
              category: data.category,
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
              hasDocuments:
                data.hasDocuments === undefined ? true : data.hasDocuments,
              selfCheckDocuments: data.selfCheckDocuments,
              hasSelfCheckDocuments:
                data.hasSelfCheckDocuments ?? Boolean(data.selfCheckDocuments),
              packingListArchived: data.packingListArchived,
              quantity: quantitySummary.quantity,
              stationSelection: data.stationSelection || null,
              qualifiedQuantity: quantitySummary.qualifiedQuantity,
              unqualifiedQuantity: quantitySummary.unqualifiedQuantity,
              inspector: data.inspector,
              templateId: templateBinding.templateId,
              templateName: templateBinding.templateName,
              inspectionDate: new Date(data.inspectionDate || new Date()),
              reportDate: data.reportDate ? new Date(data.reportDate) : null,
              result: overallResult,
              remarks: data.remarks,
              isDeleted: false,
              items: {
                create: (data.items || []).map((item: InspectionItemInput) => ({
                  checkItem: item.checkItem || item.activity, // Handle ITP field mapping
                  standardValue:
                    item.standardValue !== undefined &&
                    item.standardValue !== null
                      ? String(item.standardValue)
                      : null,
                  upperTolerance:
                    item.upperTolerance !== undefined &&
                    item.upperTolerance !== null
                      ? String(item.upperTolerance)
                      : null,
                  lowerTolerance:
                    item.lowerTolerance !== undefined &&
                    item.lowerTolerance !== null
                      ? String(item.lowerTolerance)
                      : null,
                  uom: item.uom || item.unit,
                  acceptanceCriteria: item.acceptanceCriteria,
                  referenceDoc: item.referenceDoc,
                  measuredValue:
                    item.measuredValue !== undefined &&
                    item.measuredValue !== null
                      ? String(item.measuredValue)
                      : null,
                  result: (item.result as inspection_result) || 'PASS',
                  remarks: item.remarks,
                  order: item.order || 0,
                })),
              },
            },
          });
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
          await MetricRefreshQueue.enqueueSupplierScoresForInspectionIdentities(
            tx,
            {
              supplierIds: [inspection.supplierId],
              teamIds: [inspection.teamId],
            },
            'inspection.created',
          );
          return inspection;
        };
        const inspection = await (client
          ? execute(client)
          : prisma.$transaction(execute));
        return inspection;
      } catch (error) {
        if (attempt < maxRetry && isInspectionSerialNumberConflict(error)) {
          logger.warn(
            { attempt, maxRetry, module: 'InspectionService' },
            'inspection serial number conflict, retrying create',
          );
          continue;
        }
        throw error;
      }
    }

    throw new Error('创建检验记录失败：流水号冲突重试超限');
  },
};
