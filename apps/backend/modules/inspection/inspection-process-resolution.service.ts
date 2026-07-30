import { ProcessMasterService } from '~/modules/process-master';
import { MasterDataResolutionAuditService } from '~/modules/supplier-identity';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

function assertSupportedAudit(audit: {
  entityType: string;
  fieldName: string;
  status: string;
}) {
  if (
    audit.status !== 'OPEN' ||
    audit.entityType !== 'qms_inspection_requests' ||
    audit.fieldName !== 'processId'
  ) {
    throw new BusinessError(
      'MASTER_DATA_REFERENCE_NOT_SUPPORTED',
      'The unresolved reference is not an open inspection request process',
      400,
    );
  }
}

export const InspectionProcessResolutionService = {
  async resolve(params: { auditId: string; note: string; processId: string }) {
    return prisma.$transaction(
      async (tx) => {
        const audit = await MasterDataResolutionAuditService.get(
          params.auditId,
          tx,
        );
        if (!audit) {
          throw new BusinessError(
            'MASTER_DATA_REFERENCE_NOT_FOUND',
            'Unresolved reference not found',
            404,
          );
        }
        assertSupportedAudit(audit);
        const process = await ProcessMasterService.findActiveById(
          params.processId,
          tx,
        );
        if (!process) {
          throw new BusinessError(
            'PROCESS_NOT_FOUND',
            'Active process not found',
            404,
          );
        }

        let affectedCount = 0;
        let afterId: string | undefined;
        let resolvedAuditCount = 0;
        for (;;) {
          const matchingAudits =
            await MasterDataResolutionAuditService.findMatchingOpenBatch(
              {
                afterId,
                entityType: audit.entityType,
                fieldName: audit.fieldName,
                rawId: audit.rawId,
                rawName: audit.rawName,
                take: 500,
              },
              tx,
            );
          if (matchingAudits.length === 0) break;
          afterId = matchingAudits.at(-1)?.id;
          const eligibleRecords = await tx.qms_inspection_requests.findMany({
            where: {
              id: { in: matchingAudits.map((item) => item.entityId) },
              isDeleted: false,
              processId: audit.rawId,
              processName: audit.rawName || '',
            },
            select: { id: true },
          });
          const eligibleIds = new Set(eligibleRecords.map((item) => item.id));
          const eligibleAudits = matchingAudits.filter((item) =>
            eligibleIds.has(item.entityId),
          );
          if (eligibleAudits.length === 0) continue;
          const updated = await tx.qms_inspection_requests.updateMany({
            where: {
              id: { in: eligibleAudits.map((item) => item.entityId) },
              isDeleted: false,
              processId: audit.rawId,
              processName: audit.rawName || '',
            },
            data: { processId: process.id, processName: process.name },
          });
          if (updated.count !== eligibleAudits.length) {
            throw new BusinessError(
              'MASTER_DATA_REFERENCE_CHANGED',
              'Inspection request process changed during resolution',
              409,
            );
          }
          const resolved = await MasterDataResolutionAuditService.resolveMany(
            {
              ids: eligibleAudits.map((item) => item.id),
              note: params.note || 'Resolved from master data governance',
              resolvedId: process.id,
            },
            tx,
          );
          if (resolved.count !== eligibleAudits.length) {
            throw new BusinessError(
              'MASTER_DATA_REFERENCE_CHANGED',
              'Inspection governance references changed during resolution',
              409,
            );
          }
          affectedCount += updated.count;
          resolvedAuditCount += resolved.count;
        }
        if (affectedCount === 0) {
          throw new BusinessError(
            'MASTER_DATA_REFERENCE_CHANGED',
            'Inspection request process changed after the audit was created',
            409,
          );
        }
        return {
          affectedCount,
          auditId: audit.id,
          process,
          resolvedAuditCount,
        };
      },
      { maxWait: 5000, timeout: 60_000 },
    );
  },
};
