import { DeptService } from '~/modules/dept';
import { QualityLossIndexQueue } from '~/modules/quality-loss';
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
    audit.entityType !== 'quality_records' ||
    audit.fieldName !== 'responsibleDepartmentId'
  ) {
    throw new BusinessError(
      'MASTER_DATA_REFERENCE_NOT_SUPPORTED',
      'The unresolved reference is not an open inspection department',
      400,
    );
  }
}

export const InspectionDepartmentResolutionService = {
  async resolve(params: {
    auditId: string;
    departmentId: string;
    note: string;
  }) {
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
        const department = await DeptService.findActiveById(
          params.departmentId,
          tx,
        );
        if (!department) {
          throw new BusinessError(
            'DEPARTMENT_NOT_FOUND',
            'Active department not found',
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
          const eligibleRecords = await tx.quality_records.findMany({
            where: {
              id: { in: matchingAudits.map((item) => item.entityId) },
              isDeleted: false,
              responsibleDepartment: audit.rawName || '',
              responsibleDepartmentId: audit.rawId,
            },
            select: { id: true },
          });
          const eligibleIds = new Set(eligibleRecords.map((item) => item.id));
          const eligibleAudits = matchingAudits.filter((item) =>
            eligibleIds.has(item.entityId),
          );
          if (eligibleAudits.length === 0) continue;
          const updated = await tx.quality_records.updateMany({
            where: {
              id: { in: eligibleAudits.map((item) => item.entityId) },
              isDeleted: false,
              responsibleDepartment: audit.rawName || '',
              responsibleDepartmentId: audit.rawId,
            },
            data: {
              responsibleBU: department.businessUnit,
              responsibleDepartment: department.name,
              responsibleDepartmentId: department.id,
              responsibleDepartments: JSON.stringify([department.name]),
            },
          });
          await QualityLossIndexQueue.enqueue(
            tx,
            eligibleAudits.map((item) => ({
              source: 'INTERNAL',
              sourcePk: item.entityId,
            })),
            'inspection-issue.department-resolved',
          );
          if (updated.count !== eligibleAudits.length) {
            throw new BusinessError(
              'MASTER_DATA_REFERENCE_CHANGED',
              'Inspection department changed during resolution',
              409,
            );
          }
          const resolved = await MasterDataResolutionAuditService.resolveMany(
            {
              ids: eligibleAudits.map((item) => item.id),
              note: params.note || 'Resolved from master data governance',
              resolvedId: department.id,
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
            'Inspection department changed after the audit was created',
            409,
          );
        }
        return {
          affectedCount,
          auditId: audit.id,
          department,
          resolvedAuditCount,
        };
      },
      { maxWait: 5000, timeout: 60_000 },
    );
  },
};
