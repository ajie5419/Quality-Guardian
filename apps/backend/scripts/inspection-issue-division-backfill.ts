import type { Prisma } from '@prisma/client';

import process from 'node:process';

import prisma from '~/utils/prisma';

export type DivisionBackfillMode = 'apply' | 'dry-run';

export interface DivisionBackfillOptions {
  batchSize: number;
  maxBatches?: number;
  mode: DivisionBackfillMode;
}

export interface DivisionIdentity {
  id: string;
  name: string;
}

interface DivisionIdentityContext {
  ambiguousNames: Set<string>;
  departmentById: Map<string, DivisionIdentity>;
  departmentByName: Map<string, DivisionIdentity>;
  legacyNameById: Map<string, string>;
}

interface DivisionInput {
  division: null | string;
  divisionId: null | string;
}

export type DivisionResolution =
  | {
      action: 'conflict';
      candidates: DivisionIdentity[];
      reason: 'CONFLICTING_DIVISION_EVIDENCE';
    }
  | { action: 'empty' }
  | { action: 'resolved'; candidate: DivisionIdentity }
  | {
      action: 'unresolved';
      reason: 'AMBIGUOUS_DEPARTMENT_NAME' | 'UNKNOWN_DIVISION_REFERENCE';
    };

interface BackfillScopeSummary {
  batches: number;
  concurrentChanges: number;
  conflicts: number;
  plannedOrUpdated: number;
  processed: number;
  skipped: number;
  unresolved: number;
}

interface UnresolvedAuditInput {
  entityId: string;
  evidence: Record<string, null | number | string>;
  fieldName: 'divisionId' | 'inspectionId';
  rawId: null | string;
  rawName: null | string;
  reason: string;
  type: 'unresolved';
}

interface ResolvedAuditInput {
  entityId: string;
  fieldName: 'divisionId' | 'inspectionId';
  resolvedId: string;
  type: 'resolved';
}

type AuditInput = ResolvedAuditInput | UnresolvedAuditInput;

export interface DivisionBackfillConflict {
  entityId: string;
  reason: string;
  requestId?: string;
  scope: 'quality_record' | 'work_order';
}

export interface DivisionBackfillSummary {
  conflicts: DivisionBackfillConflict[];
  issues: BackfillScopeSummary;
  mode: DivisionBackfillMode;
  workOrders: BackfillScopeSummary;
}

const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 1000;
const CONFLICT_SAMPLE_LIMIT = 50;

function normalizeText(value: null | string | undefined) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function parsePositiveInteger(value: string | undefined, flag: string) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

export function parseDivisionBackfillOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): DivisionBackfillOptions {
  let mode: DivisionBackfillMode =
    env.INSPECTION_ISSUE_DIVISION_BACKFILL_MODE === 'apply'
      ? 'apply'
      : 'dry-run';
  let batchSize = parsePositiveInteger(
    env.INSPECTION_ISSUE_DIVISION_BACKFILL_BATCH,
    'INSPECTION_ISSUE_DIVISION_BACKFILL_BATCH',
  );
  let maxBatches = parsePositiveInteger(
    env.INSPECTION_ISSUE_DIVISION_BACKFILL_MAX_BATCHES,
    'INSPECTION_ISSUE_DIVISION_BACKFILL_MAX_BATCHES',
  );

  for (const arg of args) {
    if (arg === '--apply') mode = 'apply';
    else if (arg === '--dry-run') mode = 'dry-run';
    else if (arg.startsWith('--mode=')) {
      const value = arg.slice('--mode='.length);
      if (value !== 'apply' && value !== 'dry-run') {
        throw new Error('--mode must be apply or dry-run');
      }
      mode = value;
    } else if (arg.startsWith('--batch-size=')) {
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

export function buildDivisionIdentityContext(
  departments: DivisionIdentity[],
  legacyDictionaries: Array<{ dictKey: string; id: string }>,
): DivisionIdentityContext {
  const departmentById = new Map(
    departments.map((department) => [department.id, department]),
  );
  const departmentsByName = new Map<string, DivisionIdentity[]>();
  for (const department of departments) {
    const name = normalizeText(department.name);
    if (!name) continue;
    const values = departmentsByName.get(name) || [];
    values.push(department);
    departmentsByName.set(name, values);
  }
  const departmentByName = new Map<string, DivisionIdentity>();
  const ambiguousNames = new Set<string>();
  for (const [name, values] of departmentsByName) {
    const candidate = values[0];
    if (values.length === 1 && candidate) departmentByName.set(name, candidate);
    else ambiguousNames.add(name);
  }
  return {
    ambiguousNames,
    departmentById,
    departmentByName,
    legacyNameById: new Map(
      legacyDictionaries.map((dictionary) => [
        dictionary.id,
        dictionary.dictKey,
      ]),
    ),
  };
}

function resolveLegacyIdentity(
  value: null | string,
  context: DivisionIdentityContext,
) {
  if (!value) return null;
  const legacyName = normalizeText(context.legacyNameById.get(value));
  return legacyName ? context.departmentByName.get(legacyName) || null : null;
}

export function resolveDivisionIdentity(
  input: DivisionInput,
  context: DivisionIdentityContext,
): DivisionResolution {
  const divisionId = normalizeText(input.divisionId);
  const division = normalizeText(input.division);
  if (!divisionId && !division) return { action: 'empty' };

  const orderedCandidates = [
    divisionId ? context.departmentById.get(divisionId) || null : null,
    division ? context.departmentById.get(division) || null : null,
    division ? context.departmentByName.get(division) || null : null,
    resolveLegacyIdentity(divisionId, context),
    resolveLegacyIdentity(division, context),
  ];
  const candidates = new Map<string, DivisionIdentity>();
  for (const candidate of orderedCandidates) {
    if (candidate) candidates.set(candidate.id, candidate);
  }
  if (candidates.size > 1) {
    return {
      action: 'conflict',
      candidates: [...candidates.values()],
      reason: 'CONFLICTING_DIVISION_EVIDENCE',
    };
  }
  const candidate = candidates.values().next().value as
    | DivisionIdentity
    | undefined;
  if (candidate) return { action: 'resolved', candidate };
  if (
    (division && context.ambiguousNames.has(division)) ||
    (divisionId &&
      context.ambiguousNames.has(
        normalizeText(context.legacyNameById.get(divisionId)) || '',
      )) ||
    (division &&
      context.ambiguousNames.has(
        normalizeText(context.legacyNameById.get(division)) || '',
      ))
  ) {
    return { action: 'unresolved', reason: 'AMBIGUOUS_DEPARTMENT_NAME' };
  }
  return { action: 'unresolved', reason: 'UNKNOWN_DIVISION_REFERENCE' };
}

function emptyScopeSummary(): BackfillScopeSummary {
  return {
    batches: 0,
    concurrentChanges: 0,
    conflicts: 0,
    plannedOrUpdated: 0,
    processed: 0,
    skipped: 0,
    unresolved: 0,
  };
}

function addConflict(
  conflicts: DivisionBackfillConflict[],
  conflict: DivisionBackfillConflict,
) {
  if (conflicts.length < CONFLICT_SAMPLE_LIMIT) conflicts.push(conflict);
}

async function persistAuditInputs(
  entityType: 'quality_records' | 'work_orders',
  inputs: AuditInput[],
) {
  const inputsByKey = new Map<string, AuditInput>();
  for (const input of inputs) {
    const key = `${input.entityId}:${input.fieldName}`;
    const existing = inputsByKey.get(key);
    if (!existing || input.type === 'unresolved') inputsByKey.set(key, input);
  }
  const operations = [...inputsByKey.values()].map((input) => {
    if (input.type === 'resolved') {
      return prisma.unresolved_master_data_refs.updateMany({
        where: {
          entityId: input.entityId,
          entityType,
          fieldName: input.fieldName,
          isDeleted: false,
          status: 'OPEN',
        },
        data: {
          resolutionNote: 'Resolved by inspection issue division backfill',
          resolvedAt: new Date(),
          resolvedId: input.resolvedId,
          status: 'RESOLVED',
        },
      });
    }
    return prisma.unresolved_master_data_refs.upsert({
      where: {
        entityType_entityId_fieldName: {
          entityId: input.entityId,
          entityType,
          fieldName: input.fieldName,
        },
      },
      create: {
        entityId: input.entityId,
        entityType,
        evidence: input.evidence,
        fieldName: input.fieldName,
        rawId: input.rawId,
        rawName: input.rawName,
        reason: input.reason,
      },
      update: {
        evidence: input.evidence,
        isDeleted: false,
        rawId: input.rawId,
        rawName: input.rawName,
        reason: input.reason,
      },
    });
  });
  if (operations.length > 0) await prisma.$transaction(operations);
}

function buildDivisionUnresolvedAudit(
  entityId: string,
  input: DivisionInput,
  resolution: Exclude<DivisionResolution, { action: 'empty' | 'resolved' }>,
): UnresolvedAuditInput {
  return {
    entityId,
    evidence: {
      candidateIds:
        resolution.action === 'conflict'
          ? resolution.candidates.map((candidate) => candidate.id).join(',')
          : '',
    },
    fieldName: 'divisionId',
    rawId: normalizeText(input.divisionId),
    rawName: normalizeText(input.division),
    reason: resolution.reason,
    type: 'unresolved',
  };
}

async function loadIdentityContext() {
  const [departments, legacyDictionaries] = await Promise.all([
    prisma.departments.findMany({
      where: { isDeleted: false, status: 1 },
      select: { id: true, name: true },
    }),
    prisma.dictionaries.findMany({
      where: { dictType: 'division', isDeleted: false },
      select: { dictKey: true, id: true },
    }),
  ]);
  return buildDivisionIdentityContext(departments, legacyDictionaries);
}

async function backfillWorkOrders(
  options: DivisionBackfillOptions,
  context: DivisionIdentityContext,
  conflicts: DivisionBackfillConflict[],
) {
  const summary = emptyScopeSummary();
  let cursor: string | undefined;

  while (!options.maxBatches || summary.batches < options.maxBatches) {
    const rows = await prisma.work_orders.findMany({
      where: {
        isDeleted: false,
        ...(cursor ? { workOrderNumber: { gt: cursor } } : {}),
      },
      orderBy: { workOrderNumber: 'asc' },
      take: options.batchSize,
      select: { division: true, divisionId: true, workOrderNumber: true },
    });
    if (rows.length === 0) break;
    summary.batches += 1;
    summary.processed += rows.length;
    cursor = rows.at(-1)?.workOrderNumber;
    const updates: Array<{
      candidate: DivisionIdentity;
      division: null | string;
      divisionId: null | string;
      workOrderNumber: string;
    }> = [];
    const auditInputs: AuditInput[] = [];

    for (const row of rows) {
      const resolution = resolveDivisionIdentity(row, context);
      switch (resolution.action) {
        case 'conflict': {
          summary.conflicts += 1;
          auditInputs.push(
            buildDivisionUnresolvedAudit(row.workOrderNumber, row, resolution),
          );
          addConflict(conflicts, {
            entityId: row.workOrderNumber,
            reason: resolution.reason,
            scope: 'work_order',
          });
          break;
        }
        case 'empty': {
          summary.skipped += 1;
          break;
        }
        case 'resolved': {
          if (row.divisionId === resolution.candidate.id) {
            summary.skipped += 1;
            auditInputs.push({
              entityId: row.workOrderNumber,
              fieldName: 'divisionId',
              resolvedId: resolution.candidate.id,
              type: 'resolved',
            });
          } else {
            updates.push({
              candidate: resolution.candidate,
              division: row.division,
              divisionId: row.divisionId,
              workOrderNumber: row.workOrderNumber,
            });
          }
          break;
        }
        case 'unresolved': {
          summary.unresolved += 1;
          auditInputs.push(
            buildDivisionUnresolvedAudit(row.workOrderNumber, row, resolution),
          );
          break;
        }
      }
    }

    if (options.mode === 'apply' && updates.length > 0) {
      const results = await prisma.$transaction(
        updates.map((update) =>
          prisma.work_orders.updateMany({
            where: {
              division: update.division,
              divisionId: update.divisionId,
              isDeleted: false,
              workOrderNumber: update.workOrderNumber,
            },
            data: {
              divisionId: update.candidate.id,
            },
          }),
        ),
      );
      const applied = results.reduce(
        (total, result) => total + result.count,
        0,
      );
      summary.plannedOrUpdated += applied;
      summary.concurrentChanges += updates.length - applied;
      results.forEach((result, index) => {
        const update = updates[index];
        if (result.count > 0 && update) {
          auditInputs.push({
            entityId: update.workOrderNumber,
            fieldName: 'divisionId',
            resolvedId: update.candidate.id,
            type: 'resolved',
          });
        }
      });
    } else {
      summary.plannedOrUpdated += updates.length;
    }
    if (options.mode === 'apply') {
      await persistAuditInputs('work_orders', auditInputs);
    }
  }
  return summary;
}

type IssueUpdate = {
  data: Prisma.quality_recordsUncheckedUpdateManyInput;
  division: null | string;
  divisionId: null | string;
  id: string;
  inspectionId: null | string;
};

interface IssuePlan {
  auditInputs: AuditInput[];
  update: IssueUpdate | null;
}

function planIssueUpdate(
  issue: DivisionInput & { id: string; inspectionId: null | string },
  request: {
    id: string;
    inspectionId: null | string;
    inspectionLinks: Array<{ inspectionId: string }>;
    work_order: DivisionInput;
  },
  context: DivisionIdentityContext,
  summary: BackfillScopeSummary,
  conflicts: DivisionBackfillConflict[],
): IssuePlan {
  const issueResolution = resolveDivisionIdentity(issue, context);
  const workOrderResolution = resolveDivisionIdentity(
    request.work_order,
    context,
  );
  let targetDivision: DivisionIdentity | null = null;
  const issueCandidate =
    issueResolution.action === 'resolved' ? issueResolution.candidate : null;
  const workOrderCandidate =
    workOrderResolution.action === 'resolved'
      ? workOrderResolution.candidate
      : null;
  const auditInputs: AuditInput[] = [];
  const hasDivisionConflict =
    issueResolution.action === 'conflict' ||
    workOrderResolution.action === 'conflict' ||
    Boolean(
      issueCandidate &&
        workOrderCandidate &&
        issueCandidate.id !== workOrderCandidate.id,
    ) ||
    Boolean(issueResolution.action === 'unresolved' && workOrderCandidate);

  if (hasDivisionConflict) {
    summary.conflicts += 1;
    addConflict(conflicts, {
      entityId: issue.id,
      reason: 'CONFLICTING_ISSUE_AND_WORK_ORDER_DIVISION',
      requestId: request.id,
      scope: 'quality_record',
    });
    auditInputs.push({
      entityId: issue.id,
      evidence: {
        issueCandidateId: issueCandidate?.id || null,
        requestId: request.id,
        workOrderCandidateId: workOrderCandidate?.id || null,
      },
      fieldName: 'divisionId',
      rawId: normalizeText(issue.divisionId),
      rawName: normalizeText(issue.division),
      reason: 'CONFLICTING_ISSUE_AND_WORK_ORDER_DIVISION',
      type: 'unresolved',
    });
  } else {
    targetDivision = workOrderCandidate || issueCandidate;
    if (
      !targetDivision &&
      (issueResolution.action === 'unresolved' ||
        workOrderResolution.action === 'unresolved')
    ) {
      summary.unresolved += 1;
      auditInputs.push({
        entityId: issue.id,
        evidence: {
          requestId: request.id,
          workOrderDivision: normalizeText(request.work_order.division),
          workOrderDivisionId: normalizeText(request.work_order.divisionId),
        },
        fieldName: 'divisionId',
        rawId: normalizeText(issue.divisionId),
        rawName: normalizeText(issue.division),
        reason: 'DIVISION_IDENTITY_NOT_RESOLVED',
        type: 'unresolved',
      });
    } else if (targetDivision) {
      auditInputs.push({
        entityId: issue.id,
        fieldName: 'divisionId',
        resolvedId: targetDivision.id,
        type: 'resolved',
      });
    }
  }

  const primaryInspectionId = request.inspectionLinks[0]?.inspectionId || null;
  const candidateInspectionId = request.inspectionId || primaryInspectionId;
  const resolvedInspectionId = issue.inspectionId || candidateInspectionId;
  const hasInspectionConflict = Boolean(
    issue.inspectionId &&
      candidateInspectionId &&
      issue.inspectionId !== candidateInspectionId,
  );
  if (hasInspectionConflict) {
    summary.conflicts += 1;
    addConflict(conflicts, {
      entityId: issue.id,
      reason: 'CONFLICTING_INSPECTION_LINK',
      requestId: request.id,
      scope: 'quality_record',
    });
    auditInputs.push({
      entityId: issue.id,
      evidence: {
        candidateInspectionId,
        requestId: request.id,
      },
      fieldName: 'inspectionId',
      rawId: issue.inspectionId,
      rawName: null,
      reason: 'CONFLICTING_INSPECTION_LINK',
      type: 'unresolved',
    });
  } else if (resolvedInspectionId) {
    auditInputs.push({
      entityId: issue.id,
      fieldName: 'inspectionId',
      resolvedId: resolvedInspectionId,
      type: 'resolved',
    });
  } else {
    summary.unresolved += 1;
    auditInputs.push({
      entityId: issue.id,
      evidence: { requestId: request.id },
      fieldName: 'inspectionId',
      rawId: null,
      rawName: null,
      reason: 'MISSING_INSPECTION_LINK_EVIDENCE',
      type: 'unresolved',
    });
  }

  const data: Prisma.quality_recordsUncheckedUpdateManyInput = {};
  if (targetDivision && issue.divisionId !== targetDivision.id) {
    data.divisionId = targetDivision.id;
  }
  if (!issue.inspectionId && candidateInspectionId) {
    data.inspectionId = candidateInspectionId;
  }
  return {
    auditInputs,
    update:
      Object.keys(data).length === 0
        ? null
        : {
            data,
            division: issue.division,
            divisionId: issue.divisionId,
            id: issue.id,
            inspectionId: issue.inspectionId,
          },
  };
}

async function backfillLinkedIssues(
  options: DivisionBackfillOptions,
  context: DivisionIdentityContext,
  conflicts: DivisionBackfillConflict[],
) {
  const summary = emptyScopeSummary();
  let cursor: string | undefined;

  while (!options.maxBatches || summary.batches < options.maxBatches) {
    const requests = await prisma.qms_inspection_requests.findMany({
      where: {
        isDeleted: false,
        linkedIssueId: { not: null },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: options.batchSize,
      select: {
        id: true,
        inspectionId: true,
        linkedIssueId: true,
        inspectionLinks: {
          where: { isPrimary: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { inspectionId: true },
        },
        work_order: { select: { division: true, divisionId: true } },
      },
    });
    if (requests.length === 0) break;
    summary.batches += 1;
    summary.processed += requests.length;
    cursor = requests.at(-1)?.id;
    const issueIds = requests.flatMap((request) =>
      request.linkedIssueId ? [request.linkedIssueId] : [],
    );
    const issues = await prisma.quality_records.findMany({
      where: { id: { in: issueIds }, isDeleted: false },
      select: {
        division: true,
        divisionId: true,
        id: true,
        inspectionId: true,
      },
    });
    const issueById = new Map(issues.map((issue) => [issue.id, issue]));
    const plans: IssuePlan[] = [];

    for (const request of requests) {
      const issue = request.linkedIssueId
        ? issueById.get(request.linkedIssueId)
        : undefined;
      if (!issue) {
        summary.unresolved += 1;
        continue;
      }
      const plan = planIssueUpdate(issue, request, context, summary, conflicts);
      plans.push(plan);
      if (!plan.update) summary.skipped += 1;
    }

    const plannedUpdates = plans.flatMap((plan) =>
      plan.update
        ? [{ auditInputs: plan.auditInputs, update: plan.update }]
        : [],
    );
    const updates = plannedUpdates.map((plan) => plan.update);
    const auditInputs = plans.flatMap((plan) =>
      plan.update ? [] : plan.auditInputs,
    );

    if (options.mode === 'apply' && updates.length > 0) {
      const results = await prisma.$transaction(
        updates.map((update) =>
          prisma.quality_records.updateMany({
            where: {
              division: update.division,
              divisionId: update.divisionId,
              id: update.id,
              inspectionId: update.inspectionId,
              isDeleted: false,
            },
            data: update.data,
          }),
        ),
      );
      const applied = results.reduce(
        (total, result) => total + result.count,
        0,
      );
      summary.plannedOrUpdated += applied;
      summary.concurrentChanges += updates.length - applied;
      results.forEach((result, index) => {
        const plan = plannedUpdates[index];
        if (result.count > 0 && plan) auditInputs.push(...plan.auditInputs);
      });
    } else {
      summary.plannedOrUpdated += updates.length;
    }
    if (options.mode === 'apply') {
      await persistAuditInputs('quality_records', auditInputs);
    }
  }
  return summary;
}

export async function backfillInspectionIssueDivisions(
  options: DivisionBackfillOptions,
): Promise<DivisionBackfillSummary> {
  const context = await loadIdentityContext();
  const conflicts: DivisionBackfillConflict[] = [];
  const workOrders = await backfillWorkOrders(options, context, conflicts);
  const issues = await backfillLinkedIssues(options, context, conflicts);
  return { conflicts, issues, mode: options.mode, workOrders };
}
