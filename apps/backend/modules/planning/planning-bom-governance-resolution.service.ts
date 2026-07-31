import type { Prisma } from '@prisma/client';

import { serializeBomRequiredProcesses } from '@qgs/shared';
import { PartMasterService } from '~/modules/part-master';
import { ProcessMasterService } from '~/modules/process-master';
import { MasterDataResolutionAuditService } from '~/modules/supplier-identity';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

type BomAuditField = 'partId' | 'requiredProcessIds';
type ResolutionClient = Prisma.TransactionClient;

function assertSupportedAudit(
  audit: { entityType: string; fieldName: string; status: string },
  fieldName: BomAuditField,
) {
  if (
    audit.status !== 'OPEN' ||
    audit.entityType !== 'project_boms' ||
    audit.fieldName !== fieldName
  ) {
    throw new BusinessError(
      'MASTER_DATA_REFERENCE_NOT_SUPPORTED',
      'The unresolved reference is not an open BOM governance item',
      400,
    );
  }
}

async function loadAudit(
  auditId: string,
  fieldName: BomAuditField,
  tx: ResolutionClient,
) {
  const audit = await MasterDataResolutionAuditService.get(auditId, tx);
  if (!audit) {
    throw new BusinessError(
      'MASTER_DATA_REFERENCE_NOT_FOUND',
      'Unresolved reference not found',
      404,
    );
  }
  assertSupportedAudit(audit, fieldName);
  return audit;
}

async function resolveMatchingAudits(params: {
  apply: (audits: Array<{ entityId: string; id: string }>) => Promise<string[]>;
  audit: Awaited<ReturnType<typeof loadAudit>>;
  note: string;
  resolvedId: string;
  tx: ResolutionClient;
}) {
  let affectedCount = 0;
  let afterId: string | undefined;
  let resolvedAuditCount = 0;
  for (;;) {
    const audits = await MasterDataResolutionAuditService.findMatchingOpenBatch(
      {
        afterId,
        entityType: params.audit.entityType,
        fieldName: params.audit.fieldName,
        rawId: params.audit.rawId,
        rawName: params.audit.rawName,
        take: 500,
      },
      params.tx,
    );
    if (audits.length === 0) break;
    afterId = audits.at(-1)?.id;
    const appliedAuditIds = await params.apply(audits);
    if (appliedAuditIds.length === 0) continue;
    const resolved = await MasterDataResolutionAuditService.resolveMany(
      {
        ids: appliedAuditIds,
        note: params.note || 'Resolved from master data governance',
        resolvedId: params.resolvedId,
      },
      params.tx,
    );
    if (resolved.count !== appliedAuditIds.length) {
      throw new BusinessError(
        'MASTER_DATA_REFERENCE_CHANGED',
        'BOM governance references changed during resolution',
        409,
      );
    }
    affectedCount += appliedAuditIds.length;
    resolvedAuditCount += resolved.count;
  }
  if (affectedCount === 0) {
    throw new BusinessError(
      'MASTER_DATA_REFERENCE_CHANGED',
      'BOM data changed after the audit was created',
      409,
    );
  }
  return { affectedCount, resolvedAuditCount };
}

async function resolveActiveProcesses(
  processIds: string[],
  tx: ResolutionClient,
) {
  const uniqueIds = [...new Set(processIds.map((id) => id.trim()))].filter(
    Boolean,
  );
  if (uniqueIds.length === 0) {
    throw new BusinessError(
      'PROCESS_REQUIRED',
      'At least one active process is required',
      400,
    );
  }
  const processes = await Promise.all(
    uniqueIds.map((id) => ProcessMasterService.findActiveById(id, tx)),
  );
  if (processes.some((process) => !process)) {
    throw new BusinessError(
      'PROCESS_NOT_FOUND',
      'One or more active processes were not found',
      404,
    );
  }
  return processes.filter((process) => process !== null);
}

export const PlanningBomGovernanceResolutionService = {
  async resolvePart(params: { auditId: string; note: string; partId: string }) {
    return prisma.$transaction(
      async (tx) => {
        const audit = await loadAudit(params.auditId, 'partId', tx);
        const part = await PartMasterService.assertActive(params.partId, tx);
        const counts = await resolveMatchingAudits({
          audit,
          note: params.note,
          resolvedId: part.id,
          tx,
          apply: async (audits) => {
            const appliedAuditIds: string[] = [];
            for (const item of audits) {
              const updated = await tx.project_boms.updateMany({
                where: {
                  id: item.entityId,
                  partId: audit.rawId,
                  part_name: audit.rawName || '',
                },
                data: { partId: part.id },
              });
              if (updated.count === 1) appliedAuditIds.push(item.id);
            }
            return appliedAuditIds;
          },
        });
        return { auditId: audit.id, part, ...counts };
      },
      { maxWait: 5000, timeout: 60_000 },
    );
  },

  async resolveRequiredProcesses(params: {
    auditId: string;
    note: string;
    processIds: string[];
  }) {
    return prisma.$transaction(
      async (tx) => {
        const audit = await loadAudit(params.auditId, 'requiredProcessIds', tx);
        const processes = await resolveActiveProcesses(params.processIds, tx);
        const snapshot = serializeBomRequiredProcesses(
          processes.map((process) => process.name),
        );
        const counts = await resolveMatchingAudits({
          audit,
          note: params.note,
          resolvedId: processes.map((process) => process.id).join(','),
          tx,
          apply: async (audits) => {
            const appliedAuditIds: string[] = [];
            for (const item of audits) {
              const updated = await tx.project_boms.updateMany({
                where: {
                  id: item.entityId,
                  required_processes: audit.rawName,
                  processRequirements: { none: {} },
                },
                data: { required_processes: snapshot },
              });
              if (updated.count !== 1) continue;
              await tx.project_bom_required_processes.createMany({
                data: processes.map((process, position) => ({
                  bomId: item.entityId,
                  position,
                  processId: process.id,
                  processName: process.name,
                })),
              });
              appliedAuditIds.push(item.id);
            }
            return appliedAuditIds;
          },
        });
        return { auditId: audit.id, processes, ...counts };
      },
      { maxWait: 5000, timeout: 60_000 },
    );
  },
};
