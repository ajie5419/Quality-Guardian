import type { Prisma } from '@prisma/client';

import { parseBomRequiredProcesses } from '@qgs/shared';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import prisma from '~/utils/prisma';

type BackfillOptions = { batchSize?: number };
type Identity = { id: string; name: string };

function uniqueIdentity(values: Array<Identity | null>) {
  const identities = values.filter(Boolean);
  const byId = new Map(identities.map((item) => [item.id, item]));
  return byId.size === 1 ? [...byId.values()][0] : null;
}

async function recordUnresolved(params: {
  entityId: string;
  entityType: string;
  evidence?: Prisma.InputJsonValue;
  fieldName: string;
  rawId?: null | string;
  rawName?: null | string;
  reason: string;
}) {
  await prisma.unresolved_master_data_refs.upsert({
    where: {
      entityType_entityId_fieldName: {
        entityId: params.entityId,
        entityType: params.entityType,
        fieldName: params.fieldName,
      },
    },
    create: {
      entityId: params.entityId,
      entityType: params.entityType,
      evidence: params.evidence,
      fieldName: params.fieldName,
      rawId: params.rawId,
      rawName: params.rawName,
      reason: params.reason,
    },
    update: {
      evidence: params.evidence,
      isDeleted: false,
      rawId: params.rawId,
      rawName: params.rawName,
      reason: params.reason,
    },
  });
}

async function resolveUnresolved(
  entityType: string,
  entityId: string,
  fieldName: string,
  resolvedId: string,
) {
  await prisma.unresolved_master_data_refs.updateMany({
    where: { entityId, entityType, fieldName, isDeleted: false },
    data: {
      resolvedAt: new Date(),
      resolvedId,
      resolutionNote: 'Resolved by deterministic identity relation backfill',
      status: 'RESOLVED',
    },
  });
}

async function resolvePartBySnapshot(snapshot: string) {
  const ids = await MasterDataGovernanceKernel.resolveCanonicalIdsByNames({
    configKey: 'partName',
    names: [snapshot],
  });
  const id = String(ids.get(snapshot) || '').trim();
  return id ? { id, name: snapshot } : null;
}

export async function backfillInspectionPartIdentities(
  options: BackfillOptions = {},
) {
  const batchSize = options.batchSize ?? 200;
  let cursor: string | undefined;
  let processed = 0;
  let updated = 0;
  while (true) {
    const rows = await prisma.inspections.findMany({
      where: { isDeleted: false, partId: null },
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: batchSize,
      include: {
        inspectionRequest: { select: { partId: true, partName: true } },
        inspectionRequestLinks: {
          select: { request: { select: { partId: true, partName: true } } },
        },
      },
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      const linked = [
        row.inspectionRequest,
        ...row.inspectionRequestLinks.map((link) => link.request),
      ].map((request) =>
        request?.partId ? { id: request.partId, name: request.partName } : null,
      );
      const frozenSnapshot = String(
        row.partName ||
          (row.category === 'INCOMING'
            ? row.materialName
            : row.level1Component) ||
          '',
      ).trim();
      const linkedIdentities = linked.filter(Boolean);
      let identity: Identity | null;
      if (linkedIdentities.length > 0) {
        identity = uniqueIdentity(linkedIdentities);
      } else {
        identity = frozenSnapshot
          ? await resolvePartBySnapshot(frozenSnapshot)
          : null;
      }
      if (!identity) {
        await recordUnresolved({
          entityId: row.id,
          entityType: 'inspections',
          evidence: { linkedIdentityCount: linked.filter(Boolean).length },
          fieldName: 'partId',
          rawId: row.partId,
          rawName: frozenSnapshot || null,
          reason:
            new Set(linkedIdentities.map((item) => item.id)).size > 1
              ? 'CONFLICT'
              : 'NO_MATCH',
        });
        continue;
      }
      const canonicalName =
        await MasterDataGovernanceKernel.resolveCanonicalNameById({
          canonicalId: identity.id,
          configKey: 'partName',
        });
      if (!canonicalName) {
        await recordUnresolved({
          entityId: row.id,
          entityType: 'inspections',
          fieldName: 'partId',
          rawId: identity.id,
          rawName: identity.name,
          reason: 'INVALID_ID',
        });
        continue;
      }
      const result = await prisma.inspections.updateMany({
        where: { id: row.id, partId: row.partId, partName: row.partName },
        data: {
          partId: identity.id,
          ...(row.partName ? {} : { partName: canonicalName }),
        },
      });
      updated += result.count;
      if (result.count > 0) {
        await resolveUnresolved('inspections', row.id, 'partId', identity.id);
      }
    }
    processed += rows.length;
    cursor = rows.at(-1)?.id;
    if (rows.length < batchSize) break;
  }
  return { processed, updated };
}

export async function backfillBomRequiredProcessIdentities(
  options: BackfillOptions = {},
) {
  const batchSize = options.batchSize ?? 200;
  let cursor: string | undefined;
  let processed = 0;
  let updated = 0;
  while (true) {
    const rows = await prisma.project_boms.findMany({
      where: {
        required_processes: { not: null },
        processRequirements: { none: {} },
      },
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: batchSize,
      select: { id: true, required_processes: true },
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      const names = parseBomRequiredProcesses(row.required_processes);
      const ids = await MasterDataGovernanceKernel.resolveCanonicalIdsByNames({
        configKey: 'processName',
        names,
      });
      const identities = names.map((name) => ({
        name,
        id: String(ids.get(name) || '').trim(),
      }));
      if (identities.some((identity) => !identity.id)) {
        await recordUnresolved({
          entityId: row.id,
          entityType: 'project_boms',
          evidence: {
            unresolvedNames: identities
              .filter((identity) => !identity.id)
              .map((identity) => identity.name),
          },
          fieldName: 'requiredProcessIds',
          rawName: row.required_processes,
          reason: 'NO_MATCH',
        });
        continue;
      }
      const created = await prisma.$transaction(async (tx) => {
        const current = await tx.project_bom_required_processes.count({
          where: { bomId: row.id },
        });
        if (current > 0) return 0;
        const result = await tx.project_bom_required_processes.createMany({
          data: identities.map((identity, position) => ({
            bomId: row.id,
            position,
            processId: identity.id,
            processName: identity.name,
          })),
        });
        return result.count;
      });
      if (created > 0) {
        updated += 1;
        await resolveUnresolved(
          'project_boms',
          row.id,
          'requiredProcessIds',
          identities.map((identity) => identity.id).join(','),
        );
      }
    }
    processed += rows.length;
    cursor = rows.at(-1)?.id;
    if (rows.length < batchSize) break;
  }
  return { processed, updated };
}

export async function backfillWorkOrderRequirementProcessIdentities(
  options: BackfillOptions = {},
) {
  const batchSize = options.batchSize ?? 200;
  let cursor: string | undefined;
  let processed = 0;
  let unresolved = 0;
  let updated = 0;
  while (true) {
    const rows = await prisma.work_order_requirements.findMany({
      where: {
        isDeleted: false,
        processId: null,
        processName: { not: null },
      },
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: batchSize,
      select: { id: true, processName: true },
    });
    if (rows.length === 0) break;
    const names = rows.map((row) => String(row.processName || '').trim());
    const ids = await MasterDataGovernanceKernel.resolveCanonicalIdsByNames({
      configKey: 'processName',
      names,
    });
    for (const row of rows) {
      const processName = String(row.processName || '').trim();
      const processId = String(ids.get(processName) || '').trim();
      if (!processId) {
        unresolved += 1;
        await recordUnresolved({
          entityId: row.id,
          entityType: 'work_order_requirements',
          fieldName: 'processId',
          rawName: processName || null,
          reason: 'NO_ACTIVE_CANONICAL_MATCH',
        });
        continue;
      }
      const result = await prisma.work_order_requirements.updateMany({
        where: {
          id: row.id,
          isDeleted: false,
          processId: null,
          processName: row.processName,
        },
        data: { processId },
      });
      updated += result.count;
      if (result.count > 0) {
        await resolveUnresolved(
          'work_order_requirements',
          row.id,
          'processId',
          processId,
        );
      }
    }
    processed += rows.length;
    cursor = rows.at(-1)?.id;
    if (rows.length < batchSize) break;
  }
  return { processed, unresolved, updated };
}
