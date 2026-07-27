import { INCOMING_INSPECTION_PROCESS_NAME } from '@qgs/shared';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

export type InspectionRequestCategoryBackfillMode = 'apply' | 'dry-run';

export interface InspectionRequestCategoryBackfillOptions {
  batchSize: number;
  mode: InspectionRequestCategoryBackfillMode;
}

interface CategoryCandidate {
  category: 'INCOMING' | 'PROCESS' | null;
  reason: null | string;
}

interface CategoryRow {
  id: string;
  processName: string;
  supplierId: null | string;
  teamId: null | string;
}

const AUDIT_FIELD = 'category';
const AUDIT_REASON = 'conflicting_inspection_request_identity_domains';
const AUDIT_TYPE = 'qms_inspection_requests';
const logger = createModuleLogger('inspection-request-category-backfill');

export function parseInspectionRequestCategoryBackfillOptions(args: string[]) {
  let batchSize = 200;
  let mode: InspectionRequestCategoryBackfillMode = 'dry-run';
  for (const arg of args) {
    if (arg === '--apply') mode = 'apply';
    else if (arg === '--dry-run') mode = 'dry-run';
    else if (arg.startsWith('--batch-size=')) {
      const value = Number(arg.slice('--batch-size='.length));
      if (!Number.isInteger(value) || value < 1 || value > 1000) {
        throw new Error('--batch-size must be an integer between 1 and 1000');
      }
      batchSize = value;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { batchSize, mode };
}

export function resolveInspectionRequestCategory(
  row: CategoryRow,
): CategoryCandidate {
  if (row.supplierId && row.teamId) {
    return { category: null, reason: AUDIT_REASON };
  }
  if (row.supplierId) return { category: 'INCOMING', reason: null };
  if (row.teamId) return { category: 'PROCESS', reason: null };

  // This exact-name fallback is restricted to the one-time legacy adapter.
  // Online writes and statistics use the persisted category exclusively.
  return {
    category:
      row.processName.trim() === INCOMING_INSPECTION_PROCESS_NAME
        ? 'INCOMING'
        : 'PROCESS',
    reason: null,
  };
}

async function resolveCategoryAudits(entityIds: string[]) {
  if (entityIds.length === 0) return;
  await prisma.unresolved_master_data_refs.updateMany({
    where: {
      entityId: { in: entityIds },
      entityType: AUDIT_TYPE,
      fieldName: AUDIT_FIELD,
      isDeleted: false,
      reason: AUDIT_REASON,
      status: 'OPEN',
    },
    data: {
      resolutionNote: 'Resolved by inspection request category backfill',
      resolvedAt: new Date(),
      status: 'RESOLVED',
    },
  });
}

async function persistConflictAudit(row: CategoryRow) {
  await prisma.unresolved_master_data_refs.upsert({
    where: {
      entityType_entityId_fieldName: {
        entityId: row.id,
        entityType: AUDIT_TYPE,
        fieldName: AUDIT_FIELD,
      },
    },
    create: {
      entityId: row.id,
      entityType: AUDIT_TYPE,
      evidence: { supplierId: row.supplierId, teamId: row.teamId },
      fieldName: AUDIT_FIELD,
      rawId: `supplier:${row.supplierId};team:${row.teamId}`,
      rawName: row.processName,
      reason: AUDIT_REASON,
    },
    update: {
      evidence: { supplierId: row.supplierId, teamId: row.teamId },
      isDeleted: false,
      rawId: `supplier:${row.supplierId};team:${row.teamId}`,
      rawName: row.processName,
      reason: AUDIT_REASON,
      resolutionNote: null,
      resolvedAt: null,
      resolvedId: null,
      status: 'OPEN',
    },
  });
}

async function applyBatch(rows: CategoryRow[]) {
  const resolvedIds: string[] = [];
  let conflicts = 0;
  let updated = 0;
  for (const row of rows) {
    const candidate = resolveInspectionRequestCategory(row);
    if (!candidate.category) {
      conflicts += 1;
      await persistConflictAudit(row);
      continue;
    }
    const result = await prisma.qms_inspection_requests.updateMany({
      where: { category: null, id: row.id, isDeleted: false },
      data: { category: candidate.category },
    });
    updated += result.count;
    if (result.count === 1) resolvedIds.push(row.id);
  }
  await resolveCategoryAudits(resolvedIds);
  return { conflicts, updated };
}

export async function backfillInspectionRequestCategories(
  options: InspectionRequestCategoryBackfillOptions,
) {
  let cursor = '';
  let scanned = 0;
  let updated = 0;
  let conflicts = 0;
  while (true) {
    const rows = await prisma.qms_inspection_requests.findMany({
      where: {
        category: null,
        id: cursor ? { gt: cursor } : undefined,
        isDeleted: false,
      },
      orderBy: { id: 'asc' },
      take: options.batchSize,
      select: {
        id: true,
        processName: true,
        supplierId: true,
        teamId: true,
      },
    });
    if (rows.length === 0) break;
    scanned += rows.length;
    cursor = rows[rows.length - 1]?.id || cursor;
    if (options.mode === 'apply') {
      const result = await applyBatch(rows);
      conflicts += result.conflicts;
      updated += result.updated;
    } else {
      conflicts += rows.filter(
        (row) => !resolveInspectionRequestCategory(row).category,
      ).length;
    }
  }
  const summary = { conflicts, mode: options.mode, scanned, updated };
  logger.info(summary, 'inspection request category backfill finished');
  return summary;
}
