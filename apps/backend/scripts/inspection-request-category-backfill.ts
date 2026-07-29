import { INCOMING_INSPECTION_PROCESS_NAME } from '@qgs/shared';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

export type InspectionRequestCategoryBackfillMode = 'apply' | 'dry-run';

export interface InspectionRequestCategoryBackfillOptions {
  batchSize: number;
  mode: InspectionRequestCategoryBackfillMode;
}

interface CategoryCandidate {
  category: 'INCOMING' | 'PROCESS';
  reason: null;
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

async function backfillIncomingProcessCategory(
  mode: InspectionRequestCategoryBackfillMode,
) {
  const where = {
    inspectionRequestCategory: 'PROCESS',
    isDeleted: false,
    name: INCOMING_INSPECTION_PROCESS_NAME,
  };
  const scanned = await prisma.processes.count({ where });
  let updated = 0;
  if (mode === 'apply' && scanned > 0) {
    const result = await prisma.processes.updateMany({
      where,
      data: { inspectionRequestCategory: 'INCOMING' },
    });
    updated = result.count;
  }
  return { scanned, updated };
}

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
  // A process request may also carry the supplier linked to its TEAM, so TEAM
  // identity is the stronger category signal when both canonical IDs exist.
  if (row.teamId) return { category: 'PROCESS', reason: null };
  if (row.supplierId) return { category: 'INCOMING', reason: null };

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

async function applyBatch(rows: CategoryRow[]) {
  const resolvedIds: string[] = [];
  let updated = 0;
  for (const row of rows) {
    const candidate = resolveInspectionRequestCategory(row);
    const result = await prisma.qms_inspection_requests.updateMany({
      where: { category: null, id: row.id, isDeleted: false },
      data: { category: candidate.category },
    });
    updated += result.count;
    if (result.count === 1) resolvedIds.push(row.id);
  }
  await resolveCategoryAudits(resolvedIds);
  return updated;
}

export async function backfillInspectionRequestCategories(
  options: InspectionRequestCategoryBackfillOptions,
) {
  const processCategory = await backfillIncomingProcessCategory(options.mode);
  let cursor = '';
  let scanned = 0;
  let updated = 0;
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
      updated += await applyBatch(rows);
    }
  }
  const summary = {
    mode: options.mode,
    processScanned: processCategory.scanned,
    processUpdated: processCategory.updated,
    scanned,
    updated,
  };
  logger.info(summary, 'inspection request category backfill finished');
  return summary;
}
