import type { Prisma } from '@prisma/client';
import type { InspectionIssueResponsibilityType } from '@qgs/shared';

import process from 'node:process';

import {
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  normalizeInspectionIssueResponsibilityType,
} from '@qgs/shared';
import { resolveInspectionRequestIssueResponsibilities } from '~/modules/inspection/inspection-request-responsibility.service';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

export type InspectionRequestResponsibilityBackfillMode = 'apply' | 'dry-run';

export interface InspectionRequestResponsibilityBackfillOptions {
  batchSize: number;
  maxBatches?: number;
  mode: InspectionRequestResponsibilityBackfillMode;
}

type CanonicalDepartment = { id: string; name: string };
type CanonicalSupplier = { id: string; name: string };

interface RequestRow {
  category: null | string;
  id: string;
  processName: string;
  requestNo: string;
  responsibilityType: null | string;
  responsibleDepartment: null | string;
  responsibleDepartmentId: null | string;
  supplierId: null | string;
  team: null | string;
  teamId: null | string;
}

interface ResolverCandidate {
  responsibilityType: InspectionIssueResponsibilityType;
  responsibleDepartment: string;
  responsibleDepartmentId: null | string;
  supplierId: null | string;
}

interface CanonicalCandidate {
  departmentId: string;
  responsibilityType: InspectionIssueResponsibilityType;
  source: 'PERSISTED' | 'RESOLVER';
  supplierId: null | string;
}

interface BackfillUpdate {
  existing: Pick<
    RequestRow,
    | 'responsibilityType'
    | 'responsibleDepartment'
    | 'responsibleDepartmentId'
    | 'supplierId'
  >;
  id: string;
  target: {
    department: CanonicalDepartment;
    responsibilityType: InspectionIssueResponsibilityType;
    supplierId: null | string;
  };
}

interface UnresolvedAudit {
  entityId: string;
  evidence: Record<string, null | string>;
  rawId: null | string;
  rawName: null | string;
  reason: string;
}

export interface InspectionRequestResponsibilityBackfillSummary {
  batches: number;
  concurrentChanges: number;
  conflicts: number;
  hasMore: boolean;
  incomplete: boolean;
  missingEvidence: number;
  mode: InspectionRequestResponsibilityBackfillMode;
  plannedOrUpdated: number;
  processed: number;
  skipped: number;
  unresolved: number;
}

const AUDIT_ENTITY_TYPE = 'qms_inspection_requests';
const AUDIT_FIELD_NAME = 'responsibilityType';
const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 1000;
const logger = createModuleLogger('inspection-request-responsibility-backfill');

function normalizeId(value: unknown) {
  return String(value || '').trim() || null;
}

function isCanonicalCandidate(
  value: CanonicalCandidate | null,
): value is CanonicalCandidate {
  return value !== null;
}

function isSupplierId(value: null | string): value is string {
  return value !== null;
}

function parsePositiveInteger(value: string | undefined, flag: string) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

export function parseInspectionRequestResponsibilityBackfillOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): InspectionRequestResponsibilityBackfillOptions {
  let mode: InspectionRequestResponsibilityBackfillMode =
    env.INSPECTION_REQUEST_RESPONSIBILITY_BACKFILL_MODE === 'apply'
      ? 'apply'
      : 'dry-run';
  let batchSize = parsePositiveInteger(
    env.INSPECTION_REQUEST_RESPONSIBILITY_BACKFILL_BATCH,
    'INSPECTION_REQUEST_RESPONSIBILITY_BACKFILL_BATCH',
  );
  let maxBatches = parsePositiveInteger(
    env.INSPECTION_REQUEST_RESPONSIBILITY_BACKFILL_MAX_BATCHES,
    'INSPECTION_REQUEST_RESPONSIBILITY_BACKFILL_MAX_BATCHES',
  );

  for (const arg of args) {
    if (arg === '--apply') mode = 'apply';
    else if (arg === '--dry-run') mode = 'dry-run';
    else if (arg.startsWith('--batch-size=')) {
      batchSize = parsePositiveInteger(
        arg.slice('--batch-size='.length),
        '--batch-size',
      );
    } else if (arg.startsWith('--max-batches=')) {
      maxBatches = parsePositiveInteger(
        arg.slice('--max-batches='.length),
        '--max-batches',
      );
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return {
    batchSize: Math.min(batchSize ?? DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE),
    ...(maxBatches ? { maxBatches } : {}),
    mode,
  };
}

function isExternalResponsibility(
  responsibilityType: InspectionIssueResponsibilityType,
) {
  return (
    responsibilityType !==
    INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT
  );
}

function persistedCandidate(row: RequestRow): CanonicalCandidate | null {
  const responsibilityType = normalizeInspectionIssueResponsibilityType(
    row.responsibilityType,
  );
  const departmentId = normalizeId(row.responsibleDepartmentId);
  if (!responsibilityType || !departmentId) return null;
  if (isExternalResponsibility(responsibilityType) && !row.supplierId) {
    return null;
  }
  if (
    responsibilityType ===
      INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT &&
    row.supplierId
  ) {
    return null;
  }
  return {
    departmentId,
    responsibilityType,
    source: 'PERSISTED',
    supplierId: isExternalResponsibility(responsibilityType)
      ? row.supplierId
      : null,
  };
}

function resolverCandidate(
  candidate: ResolverCandidate | undefined,
): CanonicalCandidate | null {
  if (!candidate?.responsibleDepartmentId) return null;
  if (
    isExternalResponsibility(candidate.responsibilityType) &&
    !candidate.supplierId
  ) {
    return null;
  }
  return {
    departmentId: candidate.responsibleDepartmentId,
    responsibilityType: candidate.responsibilityType,
    source: 'RESOLVER',
    supplierId: isExternalResponsibility(candidate.responsibilityType)
      ? candidate.supplierId
      : null,
  };
}

function auditEvidence(options: {
  candidate: CanonicalCandidate | null;
  row: RequestRow;
}) {
  return {
    candidateDepartmentId: options.candidate?.departmentId || null,
    candidateResponsibilityType: options.candidate?.responsibilityType || null,
    candidateSource: options.candidate?.source || null,
    candidateSupplierId: options.candidate?.supplierId || null,
    category: options.row.category,
    processName: options.row.processName,
    requestNo: options.row.requestNo,
    responsibilityType: options.row.responsibilityType,
    responsibleDepartmentId: options.row.responsibleDepartmentId,
    supplierId: options.row.supplierId,
    teamId: options.row.teamId,
  };
}

export function resolveInspectionRequestResponsibilityBackfill(options: {
  activeDepartmentsById: ReadonlyMap<string, CanonicalDepartment>;
  activeSuppliersById: ReadonlyMap<string, CanonicalSupplier>;
  resolver: ResolverCandidate | undefined;
  row: RequestRow;
}):
  | { action: 'resolved'; target: BackfillUpdate['target'] }
  | { action: 'skip' }
  | { action: 'unresolved'; reason: string } {
  const rawType = normalizeId(options.row.responsibilityType);
  const normalizedType = normalizeInspectionIssueResponsibilityType(rawType);
  if (rawType && !normalizedType) {
    return { action: 'unresolved', reason: 'INVALID_RESPONSIBILITY_TYPE' };
  }

  const stored = persistedCandidate(options.row);
  const fallback = resolverCandidate(options.resolver);
  const candidate = stored || fallback;
  if (!candidate) {
    return {
      action: 'unresolved',
      reason: 'MISSING_CANONICAL_RESPONSIBILITY_EVIDENCE',
    };
  }
  if (normalizedType && normalizedType !== candidate.responsibilityType) {
    return { action: 'unresolved', reason: 'CONFLICTING_RESPONSIBILITY_TYPE' };
  }
  const existingDepartmentId = normalizeId(options.row.responsibleDepartmentId);
  if (existingDepartmentId && existingDepartmentId !== candidate.departmentId) {
    return {
      action: 'unresolved',
      reason: 'CONFLICTING_RESPONSIBLE_DEPARTMENT_ID',
    };
  }
  if (
    isExternalResponsibility(candidate.responsibilityType) &&
    options.row.supplierId &&
    options.row.supplierId !== candidate.supplierId
  ) {
    return { action: 'unresolved', reason: 'CONFLICTING_SUPPLIER_ID' };
  }

  const department = options.activeDepartmentsById.get(candidate.departmentId);
  if (!department) {
    return {
      action: 'unresolved',
      reason: 'INVALID_CANONICAL_RESPONSIBLE_DEPARTMENT',
    };
  }
  if (
    isExternalResponsibility(candidate.responsibilityType) &&
    (!candidate.supplierId ||
      !options.activeSuppliersById.has(candidate.supplierId))
  ) {
    return { action: 'unresolved', reason: 'INVALID_CANONICAL_SUPPLIER' };
  }

  const supplierId = isExternalResponsibility(candidate.responsibilityType)
    ? candidate.supplierId
    : null;
  const isCanonical =
    options.row.responsibilityType === candidate.responsibilityType &&
    options.row.responsibleDepartmentId === department.id &&
    options.row.responsibleDepartment === department.name &&
    options.row.supplierId === supplierId;
  if (isCanonical) return { action: 'skip' };
  return {
    action: 'resolved',
    target: {
      department,
      responsibilityType: candidate.responsibilityType,
      supplierId,
    },
  };
}

async function persistAudits(
  client: Prisma.TransactionClient,
  options: {
    resolved: Array<{
      entityId: string;
      evidence: Record<string, null | string>;
      resolvedId: string;
    }>;
    unresolved: UnresolvedAudit[];
  },
) {
  for (const audit of options.unresolved) {
    await client.unresolved_master_data_refs.upsert({
      where: {
        entityType_entityId_fieldName: {
          entityId: audit.entityId,
          entityType: AUDIT_ENTITY_TYPE,
          fieldName: AUDIT_FIELD_NAME,
        },
      },
      create: {
        entityId: audit.entityId,
        entityType: AUDIT_ENTITY_TYPE,
        evidence: audit.evidence,
        fieldName: AUDIT_FIELD_NAME,
        rawId: audit.rawId,
        rawName: audit.rawName,
        reason: audit.reason,
      },
      update: {
        evidence: audit.evidence,
        isDeleted: false,
        rawId: audit.rawId,
        rawName: audit.rawName,
        reason: audit.reason,
      },
    });
  }
  for (const audit of options.resolved) {
    await client.unresolved_master_data_refs.updateMany({
      where: {
        entityId: audit.entityId,
        entityType: AUDIT_ENTITY_TYPE,
        fieldName: AUDIT_FIELD_NAME,
        isDeleted: false,
        status: 'OPEN',
      },
      data: {
        evidence: audit.evidence,
        resolutionNote:
          'Resolved by inspection request responsibility backfill',
        resolvedAt: new Date(),
        resolvedId: audit.resolvedId,
        status: 'RESOLVED',
      },
    });
  }
}

async function loadCanonicalContext(candidates: CanonicalCandidate[]) {
  const departmentIds = [
    ...new Set(candidates.map((candidate) => candidate.departmentId)),
  ];
  const supplierIds = [
    ...new Set(
      candidates
        .map((candidate) => candidate.supplierId)
        .filter((id): id is string => isSupplierId(id)),
    ),
  ];
  const [departments, suppliers] = await Promise.all([
    prisma.departments.findMany({
      where: { id: { in: departmentIds }, isDeleted: false, status: 1 },
      select: { id: true, name: true },
    }),
    prisma.suppliers.findMany({
      where: { id: { in: supplierIds }, isDeleted: false },
      select: { id: true, name: true },
    }),
  ]);
  return {
    activeDepartmentsById: new Map(
      departments.map((department) => [department.id, department]),
    ),
    activeSuppliersById: new Map(
      suppliers.map((supplier) => [supplier.id, supplier]),
    ),
  };
}

export async function backfillInspectionRequestResponsibilities(
  options: InspectionRequestResponsibilityBackfillOptions,
): Promise<InspectionRequestResponsibilityBackfillSummary> {
  const summary: InspectionRequestResponsibilityBackfillSummary = {
    batches: 0,
    concurrentChanges: 0,
    conflicts: 0,
    hasMore: false,
    incomplete: false,
    missingEvidence: 0,
    mode: options.mode,
    plannedOrUpdated: 0,
    processed: 0,
    skipped: 0,
    unresolved: 0,
  };
  let cursorId: string | undefined;

  while (!options.maxBatches || summary.batches < options.maxBatches) {
    const fetchedRows = await prisma.qms_inspection_requests.findMany({
      where: {
        isDeleted: false,
        OR: [
          { responsibilityType: null },
          { responsibleDepartment: null },
          { responsibleDepartmentId: null },
          {
            responsibilityType: {
              in: [
                INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER,
                INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT,
              ],
            },
            supplierId: null,
          },
          {
            responsibilityType:
              INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
            supplierId: { not: null },
          },
          {
            responsibilityType: {
              notIn: Object.values(INSPECTION_ISSUE_RESPONSIBILITY_TYPE),
            },
          },
        ],
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: options.batchSize + 1,
      select: {
        category: true,
        id: true,
        processName: true,
        requestNo: true,
        responsibilityType: true,
        responsibleDepartment: true,
        responsibleDepartmentId: true,
        supplierId: true,
        team: true,
        teamId: true,
      },
    });
    if (fetchedRows.length === 0) break;
    const hasMore = fetchedRows.length > options.batchSize;
    const rows = fetchedRows.slice(0, options.batchSize);

    summary.batches += 1;
    summary.processed += rows.length;
    cursorId = rows.at(-1)?.id;
    const resolverResults =
      await resolveInspectionRequestIssueResponsibilities(rows);
    const rawCandidates = rows.map(
      (row, index) =>
        persistedCandidate(row) || resolverCandidate(resolverResults[index]),
    );
    const context = await loadCanonicalContext(
      rawCandidates.filter((candidate): candidate is CanonicalCandidate =>
        isCanonicalCandidate(candidate),
      ),
    );
    const updates: BackfillUpdate[] = [];
    const unresolvedAudits: UnresolvedAudit[] = [];

    for (const [index, row] of rows.entries()) {
      const resolution = resolveInspectionRequestResponsibilityBackfill({
        ...context,
        resolver: resolverResults[index],
        row,
      });
      if (resolution.action === 'skip') {
        summary.skipped += 1;
        continue;
      }
      const candidate = rawCandidates[index] || null;
      if (resolution.action === 'unresolved') {
        summary.unresolved += 1;
        if (resolution.reason.startsWith('CONFLICTING_'))
          summary.conflicts += 1;
        if (resolution.reason === 'MISSING_CANONICAL_RESPONSIBILITY_EVIDENCE') {
          summary.missingEvidence += 1;
        }
        unresolvedAudits.push({
          entityId: row.id,
          evidence: auditEvidence({ candidate, row }),
          rawId: row.responsibleDepartmentId,
          rawName: row.responsibleDepartment,
          reason: resolution.reason,
        });
        continue;
      }
      updates.push({
        existing: {
          responsibilityType: row.responsibilityType,
          responsibleDepartment: row.responsibleDepartment,
          responsibleDepartmentId: row.responsibleDepartmentId,
          supplierId: row.supplierId,
        },
        id: row.id,
        target: resolution.target,
      });
    }

    if (options.mode === 'dry-run') {
      summary.plannedOrUpdated += updates.length;
    } else {
      const applied = await prisma.$transaction(async (tx) => {
        const results: Array<{ count: number; update: BackfillUpdate }> = [];
        for (const update of updates) {
          const result = await tx.qms_inspection_requests.updateMany({
            where: { id: update.id, isDeleted: false, ...update.existing },
            data: {
              responsibilityType: update.target.responsibilityType,
              responsibleDepartment: update.target.department.name,
              responsibleDepartmentId: update.target.department.id,
              supplierId: update.target.supplierId,
            },
          });
          results.push({ count: result.count, update });
        }
        await persistAudits(tx, {
          resolved: results
            .filter((result) => result.count === 1)
            .map((result) => ({
              entityId: result.update.id,
              evidence: {
                responsibilityType: result.update.target.responsibilityType,
                responsibleDepartmentId: result.update.target.department.id,
                supplierId: result.update.target.supplierId,
              },
              resolvedId: result.update.target.department.id,
            })),
          unresolved: unresolvedAudits,
        });
        return results;
      });
      const updated = applied.filter((result) => result.count === 1).length;
      summary.plannedOrUpdated += updated;
      summary.concurrentChanges += updates.length - updated;
    }

    logger.info(
      {
        batch: summary.batches,
        cursorId,
        plannedOrUpdated: updates.length,
        processed: rows.length,
      },
      'inspection request responsibility backfill batch finished',
    );
    if (!hasMore) break;
    if (options.maxBatches && summary.batches >= options.maxBatches) {
      summary.hasMore = true;
      summary.incomplete = true;
      break;
    }
  }

  return summary;
}

export function assertInspectionRequestResponsibilityBackfillSucceeded(
  summary: InspectionRequestResponsibilityBackfillSummary,
) {
  const invalidEvidence =
    summary.unresolved - summary.missingEvidence - summary.conflicts;
  const failures = [
    { name: 'invalidEvidence', value: invalidEvidence },
    { name: 'conflicts', value: summary.conflicts },
    { name: 'concurrentChanges', value: summary.concurrentChanges },
    { name: 'incomplete', value: summary.incomplete ? 1 : 0 },
  ]
    .filter(({ value }) => value > 0)
    .map(({ name, value }) => `${name}=${value}`);
  if (failures.length > 0) {
    throw new Error(
      `Inspection request responsibility backfill integrity check failed: ${failures.join(', ')}`,
    );
  }
}
