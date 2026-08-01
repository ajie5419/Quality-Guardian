import type { inspection_category } from '@prisma/client';

import process from 'node:process';

import {
  INCOMING_INSPECTION_RESPONSIBLE_DEPARTMENT,
  isIncomingInspectionRequestProcess,
  isOutsourcingInspectionRequestProcess,
  OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT,
} from '@qgs/shared';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

export type ResponsibilityBackfillMode = 'apply' | 'dry-run';

export interface ResponsibilityBackfillOptions {
  batchSize: number;
  maxBatches?: number;
  mode: ResponsibilityBackfillMode;
}

interface CanonicalIdentity {
  id: string;
  name: string;
}

interface SupplierEvidence {
  candidate: CanonicalIdentity | null;
  rawId: null | string;
  source: 'inspection' | 'request' | 'team';
}

interface ResponsibilityResolutionInput {
  departmentByName: Map<string, CanonicalIdentity>;
  existingDepartment: CanonicalIdentity | null;
  existingDepartmentId: null | string;
  existingSupplier: CanonicalIdentity | null;
  existingSupplierId: null | string;
  inspectionCategories: inspection_category[];
  processName: string;
  supplierEvidence: SupplierEvidence[];
}

export type ResponsibilityResolution =
  | {
      action: 'resolved';
      department: CanonicalIdentity;
      supplier: CanonicalIdentity;
    }
  | { action: 'skip'; reason: 'NOT_EXTERNAL' }
  | {
      action: 'unresolved';
      candidateIds: string[];
      fieldName: 'responsibleDepartmentId' | 'supplierId';
      reason:
        | 'AMBIGUOUS_RESPONSIBILITY_ROUTE'
        | 'CONFLICTING_DEPARTMENT_IDENTITY'
        | 'CONFLICTING_SUPPLIER_EVIDENCE'
        | 'CONFLICTING_SUPPLIER_IDENTITY'
        | 'MISSING_CANONICAL_DEPARTMENT'
        | 'MISSING_EXTERNAL_SUPPLIER_EVIDENCE';
    };

interface AuditInput {
  entityId: string;
  evidence: Record<string, null | number | string>;
  fieldName: 'responsibleDepartmentId' | 'supplierId';
  rawId: null | string;
  rawName: null | string;
  reason: string;
  resolvedId?: string;
  type: 'resolved' | 'unresolved';
}

interface IssueUpdate {
  department: CanonicalIdentity;
  existing: {
    responsibleDepartment: string;
    responsibleDepartmentId: null | string;
    supplierId: null | string;
    supplierName: null | string;
  };
  id: string;
  supplier: CanonicalIdentity;
}

export interface ResponsibilityBackfillSummary {
  batches: number;
  concurrentChanges: number;
  conflicts: number;
  missingIssues: number;
  mode: ResponsibilityBackfillMode;
  plannedOrUpdated: number;
  processed: number;
  skipped: number;
  unresolved: number;
}

const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 1000;
const logger = createModuleLogger('inspection-issue-responsibility-backfill');

function parsePositiveInteger(value: string | undefined, flag: string) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

export function parseResponsibilityBackfillOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): ResponsibilityBackfillOptions {
  let mode: ResponsibilityBackfillMode =
    env.INSPECTION_ISSUE_RESPONSIBILITY_BACKFILL_MODE === 'apply'
      ? 'apply'
      : 'dry-run';
  let batchSize = parsePositiveInteger(
    env.INSPECTION_ISSUE_RESPONSIBILITY_BACKFILL_BATCH,
    'INSPECTION_ISSUE_RESPONSIBILITY_BACKFILL_BATCH',
  );
  let maxBatches = parsePositiveInteger(
    env.INSPECTION_ISSUE_RESPONSIBILITY_BACKFILL_MAX_BATCHES,
    'INSPECTION_ISSUE_RESPONSIBILITY_BACKFILL_MAX_BATCHES',
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

function uniqueCandidates(evidence: SupplierEvidence[]) {
  return new Map(
    evidence.flatMap((item) =>
      item.candidate ? [[item.candidate.id, item.candidate] as const] : [],
    ),
  );
}

export function resolveInspectionIssueResponsibility(
  input: ResponsibilityResolutionInput,
): ResponsibilityResolution {
  const candidates = uniqueCandidates(input.supplierEvidence);
  const candidateIds = [...candidates.keys()];
  const hasRawExternalReference = input.supplierEvidence.some(
    (item) => item.source !== 'team' && item.rawId,
  );
  const hasInspectionSupplier = input.supplierEvidence.some(
    (item) => item.source === 'inspection' && item.candidate,
  );
  const hasIncomingSignal =
    isIncomingInspectionRequestProcess(input.processName) ||
    input.inspectionCategories.includes('INCOMING') ||
    input.supplierEvidence.some(
      (item) => item.source === 'request' && item.candidate,
    );
  const hasOutsourcingSignal =
    isOutsourcingInspectionRequestProcess(input.processName) ||
    input.supplierEvidence.some(
      (item) => item.source === 'team' && item.candidate,
    ) ||
    (hasInspectionSupplier && input.inspectionCategories.includes('PROCESS'));

  if (candidateIds.length > 1) {
    return {
      action: 'unresolved',
      candidateIds,
      fieldName: 'supplierId',
      reason: 'CONFLICTING_SUPPLIER_EVIDENCE',
    };
  }
  const supplier = candidates.values().next().value as
    | CanonicalIdentity
    | undefined;
  if (!supplier) {
    if (
      !hasRawExternalReference &&
      !hasIncomingSignal &&
      !hasOutsourcingSignal
    ) {
      return { action: 'skip', reason: 'NOT_EXTERNAL' };
    }
    return {
      action: 'unresolved',
      candidateIds: [],
      fieldName: 'supplierId',
      reason: 'MISSING_EXTERNAL_SUPPLIER_EVIDENCE',
    };
  }
  if (input.existingSupplier && input.existingSupplier.id !== supplier.id) {
    return {
      action: 'unresolved',
      candidateIds: [input.existingSupplier.id, supplier.id],
      fieldName: 'supplierId',
      reason: 'CONFLICTING_SUPPLIER_IDENTITY',
    };
  }
  if (hasIncomingSignal && hasOutsourcingSignal) {
    return {
      action: 'unresolved',
      candidateIds: [supplier.id],
      fieldName: 'responsibleDepartmentId',
      reason: 'AMBIGUOUS_RESPONSIBILITY_ROUTE',
    };
  }

  let departmentName: null | string = null;
  if (hasIncomingSignal) {
    departmentName = INCOMING_INSPECTION_RESPONSIBLE_DEPARTMENT;
  } else if (hasOutsourcingSignal) {
    departmentName = OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT;
  }
  const department = departmentName
    ? input.departmentByName.get(departmentName)
    : undefined;
  if (!department) {
    return {
      action: 'unresolved',
      candidateIds: [supplier.id],
      fieldName: 'responsibleDepartmentId',
      reason: 'MISSING_CANONICAL_DEPARTMENT',
    };
  }
  if (
    input.existingDepartment &&
    input.existingDepartment.id !== department.id
  ) {
    return {
      action: 'unresolved',
      candidateIds: [input.existingDepartment.id, department.id],
      fieldName: 'responsibleDepartmentId',
      reason: 'CONFLICTING_DEPARTMENT_IDENTITY',
    };
  }
  return { action: 'resolved', department, supplier };
}

function buildUniqueIdentityMap(items: CanonicalIdentity[]) {
  const grouped = new Map<string, CanonicalIdentity[]>();
  for (const item of items) {
    const values = grouped.get(item.name) || [];
    values.push(item);
    grouped.set(item.name, values);
  }
  return new Map(
    [...grouped].flatMap(([name, values]) =>
      values.length === 1 && values[0] ? [[name, values[0]] as const] : [],
    ),
  );
}

function activeIdentity(
  rawId: null | string,
  relation: null | { id: string; isDeleted: boolean; name: string },
) {
  if (!rawId || !relation || relation.id !== rawId || relation.isDeleted) {
    return null;
  }
  return { id: relation.id, name: relation.name };
}

async function loadContext() {
  const [departments, links] = await Promise.all([
    prisma.departments.findMany({
      where: {
        isDeleted: false,
        status: 1,
      },
      select: { id: true, name: true },
    }),
    prisma.supplier_identity_links.findMany({
      where: { identityType: 'TEAM', isDeleted: false },
      include: {
        supplier: { select: { id: true, isDeleted: true, name: true } },
      },
    }),
  ]);
  const supplierByTeamId = new Map<string, CanonicalIdentity>();
  for (const link of links) {
    if (link.supplier.isDeleted) continue;
    supplierByTeamId.set(link.identityId, {
      id: link.supplier.id,
      name: link.supplier.name,
    });
  }
  return {
    departmentById: new Map(
      departments.map((department) => [department.id, department]),
    ),
    departmentByName: buildUniqueIdentityMap(departments),
    supplierByTeamId,
  };
}

async function persistAudits(inputs: AuditInput[]) {
  const byKey = new Map<string, AuditInput>();
  for (const input of inputs) {
    byKey.set(`${input.entityId}:${input.fieldName}`, input);
  }
  const operations = [...byKey.values()].map((input) => {
    if (input.type === 'resolved') {
      return prisma.unresolved_master_data_refs.updateMany({
        where: {
          entityId: input.entityId,
          entityType: 'quality_records',
          fieldName: input.fieldName,
          isDeleted: false,
          status: 'OPEN',
        },
        data: {
          resolutionNote:
            'Resolved by inspection issue responsibility backfill',
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
          entityType: 'quality_records',
          fieldName: input.fieldName,
        },
      },
      create: {
        entityId: input.entityId,
        entityType: 'quality_records',
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

function buildSupplierEvidence(
  request: {
    inspection: null | {
      category: inspection_category;
      supplier: null | { id: string; isDeleted: boolean; name: string };
      supplierId: null | string;
    };
    inspectionLinks: Array<{
      inspection: {
        category: inspection_category;
        supplier: null | { id: string; isDeleted: boolean; name: string };
        supplierId: null | string;
      };
    }>;
    supplier: null | { id: string; isDeleted: boolean; name: string };
    supplierId: null | string;
    teamId: null | string;
  },
  issue: {
    inspection: null | {
      category: inspection_category;
      supplier: null | { id: string; isDeleted: boolean; name: string };
      supplierId: null | string;
    };
  },
  supplierByTeamId: Map<string, CanonicalIdentity>,
) {
  const inspections = [
    issue.inspection,
    request.inspection,
    ...request.inspectionLinks.map((link) => link.inspection),
  ].filter((item) => item !== null);
  const evidence: SupplierEvidence[] = [
    {
      candidate: activeIdentity(request.supplierId, request.supplier),
      rawId: request.supplierId,
      source: 'request',
    },
    {
      candidate: request.teamId
        ? supplierByTeamId.get(request.teamId) || null
        : null,
      rawId: request.teamId,
      source: 'team',
    },
    ...inspections.map((inspection) => ({
      candidate: activeIdentity(inspection.supplierId, inspection.supplier),
      rawId: inspection.supplierId,
      source: 'inspection' as const,
    })),
  ];
  return { evidence, inspections };
}

function buildAuditEvidence(options: {
  candidateIds: string[];
  processName: string;
  requestId: string;
  requestNo: string;
  supplierId: null | string;
  teamId: null | string;
}) {
  return {
    candidateIds: options.candidateIds.join(','),
    processName: options.processName,
    requestId: options.requestId,
    requestNo: options.requestNo,
    requestSupplierId: options.supplierId,
    requestTeamId: options.teamId,
  };
}

export async function backfillInspectionIssueResponsibilities(
  options: ResponsibilityBackfillOptions,
): Promise<ResponsibilityBackfillSummary> {
  const context = await loadContext();
  const summary: ResponsibilityBackfillSummary = {
    batches: 0,
    concurrentChanges: 0,
    conflicts: 0,
    missingIssues: 0,
    mode: options.mode,
    plannedOrUpdated: 0,
    processed: 0,
    skipped: 0,
    unresolved: 0,
  };
  let cursorId: string | undefined;

  while (!options.maxBatches || summary.batches < options.maxBatches) {
    // linkedIssueId is the durable provenance for issues created while closing a request.
    const requests = await prisma.qms_inspection_requests.findMany({
      where: {
        isDeleted: false,
        linkedIssueId: { not: null },
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: options.batchSize,
      select: {
        id: true,
        inspection: {
          select: {
            category: true,
            supplier: {
              select: { id: true, isDeleted: true, name: true },
            },
            supplierId: true,
          },
        },
        inspectionLinks: {
          where: { isPrimary: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: {
            inspection: {
              select: {
                category: true,
                supplier: {
                  select: { id: true, isDeleted: true, name: true },
                },
                supplierId: true,
              },
            },
          },
        },
        linkedIssueId: true,
        processName: true,
        requestNo: true,
        supplier: { select: { id: true, isDeleted: true, name: true } },
        supplierId: true,
        teamId: true,
      },
    });
    if (requests.length === 0) break;
    summary.batches += 1;
    summary.processed += requests.length;
    cursorId = requests.at(-1)?.id;
    const issueIds = requests.flatMap((request) =>
      request.linkedIssueId ? [request.linkedIssueId] : [],
    );
    const issues = await prisma.quality_records.findMany({
      where: { id: { in: issueIds }, isDeleted: false },
      select: {
        id: true,
        inspection: {
          select: {
            category: true,
            supplier: {
              select: { id: true, isDeleted: true, name: true },
            },
            supplierId: true,
          },
        },
        responsibleDepartment: true,
        responsibleDepartmentId: true,
        supplier: { select: { id: true, isDeleted: true, name: true } },
        supplierId: true,
        supplierName: true,
      },
    });
    const issueById = new Map(issues.map((issue) => [issue.id, issue]));
    const updates: IssueUpdate[] = [];
    const audits: AuditInput[] = [];

    for (const request of requests) {
      const issue = request.linkedIssueId
        ? issueById.get(request.linkedIssueId)
        : undefined;
      if (!issue) {
        summary.missingIssues += 1;
        continue;
      }
      const supplierEvidence = buildSupplierEvidence(
        request,
        issue,
        context.supplierByTeamId,
      );
      const existingDepartment = issue.responsibleDepartmentId
        ? context.departmentById.get(issue.responsibleDepartmentId) || null
        : null;
      const resolution = resolveInspectionIssueResponsibility({
        departmentByName: context.departmentByName,
        existingDepartment,
        existingDepartmentId: issue.responsibleDepartmentId,
        existingSupplier: activeIdentity(issue.supplierId, issue.supplier),
        existingSupplierId: issue.supplierId,
        inspectionCategories: supplierEvidence.inspections.map(
          (inspection) => inspection.category,
        ),
        processName: request.processName,
        supplierEvidence: supplierEvidence.evidence,
      });
      const auditEvidence = buildAuditEvidence({
        candidateIds:
          resolution.action === 'unresolved' ? resolution.candidateIds : [],
        processName: request.processName,
        requestId: request.id,
        requestNo: request.requestNo,
        supplierId: request.supplierId,
        teamId: request.teamId,
      });
      if (resolution.action === 'skip') {
        summary.skipped += 1;
        continue;
      }
      if (resolution.action === 'unresolved') {
        summary.unresolved += 1;
        if (resolution.reason.startsWith('CONFLICTING_')) {
          summary.conflicts += 1;
        }
        audits.push({
          entityId: issue.id,
          evidence: auditEvidence,
          fieldName: resolution.fieldName,
          rawId:
            resolution.fieldName === 'supplierId'
              ? issue.supplierId
              : issue.responsibleDepartmentId,
          rawName:
            resolution.fieldName === 'supplierId'
              ? issue.supplierName
              : issue.responsibleDepartment,
          reason: resolution.reason,
          type: 'unresolved',
        });
        continue;
      }
      const isCanonical =
        issue.responsibleDepartment === resolution.department.name &&
        issue.responsibleDepartmentId === resolution.department.id &&
        issue.supplierId === resolution.supplier.id &&
        issue.supplierName === resolution.supplier.name;
      if (isCanonical) {
        summary.skipped += 1;
        audits.push(
          {
            entityId: issue.id,
            evidence: auditEvidence,
            fieldName: 'supplierId',
            rawId: issue.supplierId,
            rawName: issue.supplierName,
            resolvedId: resolution.supplier.id,
            reason: 'RESOLVED',
            type: 'resolved',
          },
          {
            entityId: issue.id,
            evidence: auditEvidence,
            fieldName: 'responsibleDepartmentId',
            rawId: issue.responsibleDepartmentId,
            rawName: issue.responsibleDepartment,
            resolvedId: resolution.department.id,
            reason: 'RESOLVED',
            type: 'resolved',
          },
        );
        continue;
      }
      updates.push({
        department: resolution.department,
        existing: {
          responsibleDepartment: issue.responsibleDepartment,
          responsibleDepartmentId: issue.responsibleDepartmentId,
          supplierId: issue.supplierId,
          supplierName: issue.supplierName,
        },
        id: issue.id,
        supplier: resolution.supplier,
      });
    }

    if (options.mode === 'apply' && updates.length > 0) {
      const results = await prisma.$transaction(
        updates.map((update) =>
          prisma.quality_records.updateMany({
            where: {
              id: update.id,
              isDeleted: false,
              ...update.existing,
            },
            data: {
              responsibleDepartmentId: update.department.id,
              supplierId: update.supplier.id,
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
        if (result.count === 0 || !update) return;
        audits.push(
          {
            entityId: update.id,
            evidence: {},
            fieldName: 'supplierId',
            rawId: update.existing.supplierId,
            rawName: update.existing.supplierName,
            resolvedId: update.supplier.id,
            reason: 'RESOLVED',
            type: 'resolved',
          },
          {
            entityId: update.id,
            evidence: {},
            fieldName: 'responsibleDepartmentId',
            rawId: update.existing.responsibleDepartmentId,
            rawName: update.existing.responsibleDepartment,
            resolvedId: update.department.id,
            reason: 'RESOLVED',
            type: 'resolved',
          },
        );
      });
    } else {
      summary.plannedOrUpdated += updates.length;
    }
    if (options.mode === 'apply') await persistAudits(audits);

    logger.info(
      {
        batch: summary.batches,
        cursorId,
        plannedOrUpdated: updates.length,
        processed: requests.length,
      },
      'inspection issue responsibility batch finished',
    );
  }

  logger.info(summary, 'inspection issue responsibility backfill finished');
  return summary;
}
