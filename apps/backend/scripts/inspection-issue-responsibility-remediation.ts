import type { inspection_category, Prisma } from '@prisma/client';
import type { InspectionIssueResponsibilityType } from '@qgs/shared';

import process from 'node:process';

import {
  INCOMING_INSPECTION_RESPONSIBLE_DEPARTMENT,
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT,
} from '@qgs/shared';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

export type InspectionIssueResponsibilityRemediationMode = 'apply' | 'dry-run';

export interface InspectionIssueResponsibilityRemediationOptions {
  batchSize: number;
  maxBatches?: number;
  mode: InspectionIssueResponsibilityRemediationMode;
}

interface CanonicalIdentity {
  id: string;
  name: string;
}

interface ResponsibilityCandidate {
  department: CanonicalIdentity;
  responsibilityType: InspectionIssueResponsibilityType;
  source: 'inspection' | 'request';
  supplier: CanonicalIdentity | null;
}

interface RemediationUpdate {
  existing: {
    responsibilityType: null | string;
    responsibleDepartment: string;
    responsibleDepartmentId: null | string;
    responsibleDepartments: null | string;
    supplierId: null | string;
    supplierName: null | string;
  };
  id: string;
  responsibilityType?: InspectionIssueResponsibilityType;
  department: CanonicalIdentity;
  supplier: CanonicalIdentity | null;
}

interface AuditInput {
  entityId: string;
  evidence: Record<string, null | number | string>;
  rawId: null | string;
  rawName: null | string;
  reason: string;
  resolvedId?: string;
  type: 'resolved' | 'unresolved';
}

export type InspectionIssueResponsibilityRemediationSummary = {
  batches: number;
  concurrentChanges: number;
  conflicts: number;
  mode: InspectionIssueResponsibilityRemediationMode;
  plannedOrUpdated: number;
  processed: number;
  skipped: number;
  unresolved: number;
};

/**
 * Both dry-run and apply are release-maintenance gates. Any unresolved
 * evidence or lost CAS update leaves responsibility facts unsafe for release.
 */
export function assertInspectionIssueResponsibilityRemediationSucceeded(
  summary: InspectionIssueResponsibilityRemediationSummary,
) {
  const blockingCounts = [
    { count: summary.unresolved, name: 'unresolved' },
    { count: summary.conflicts, name: 'conflicts' },
    { count: summary.concurrentChanges, name: 'concurrentChanges' },
  ].filter(({ count }) => count > 0);
  if (blockingCounts.length === 0) return;
  throw new Error(
    `inspection issue responsibility remediation blocked: ${blockingCounts
      .map(({ count, name }) => `${name}=${count}`)
      .join(', ')}`,
  );
}

export type CorruptedIssueResponsibilityResolution =
  | {
      action: 'resolved';
      department: CanonicalIdentity;
      responsibilityType?: InspectionIssueResponsibilityType;
      source: 'CANONICAL_DEPARTMENT_ID' | 'RELATED_INSPECTION_OR_REQUEST';
      supplier: CanonicalIdentity | null;
    }
  | {
      action: 'unresolved';
      reason:
        | 'CONFLICTING_CANONICAL_RESPONSIBILITY_EVIDENCE'
        | 'CONFLICTING_RESPONSIBILITY_TYPE'
        | 'MISSING_CANONICAL_RESPONSIBILITY_EVIDENCE'
        | 'MISSING_RESPONSIBLE_DEPARTMENT_MASTER_DATA';
    };

const CORRUPTED_RESPONSIBLE_DEPARTMENT = '[object Object]';
const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 1000;
const logger = createModuleLogger(
  'inspection-issue-responsibility-remediation',
);

function parsePositiveInteger(value: string | undefined, flag: string) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

export function parseInspectionIssueResponsibilityRemediationOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): InspectionIssueResponsibilityRemediationOptions {
  let mode: InspectionIssueResponsibilityRemediationMode =
    env.INSPECTION_ISSUE_RESPONSIBILITY_REMEDIATION_MODE === 'apply'
      ? 'apply'
      : 'dry-run';
  let batchSize = parsePositiveInteger(
    env.INSPECTION_ISSUE_RESPONSIBILITY_REMEDIATION_BATCH,
    'INSPECTION_ISSUE_RESPONSIBILITY_REMEDIATION_BATCH',
  );
  let maxBatches = parsePositiveInteger(
    env.INSPECTION_ISSUE_RESPONSIBILITY_REMEDIATION_MAX_BATCHES,
    'INSPECTION_ISSUE_RESPONSIBILITY_REMEDIATION_MAX_BATCHES',
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

export function hasCorruptedResponsibleDepartment(
  responsibleDepartment: string,
  responsibleDepartments: null | string,
) {
  if (responsibleDepartment === CORRUPTED_RESPONSIBLE_DEPARTMENT) return true;
  if (!responsibleDepartments) return false;
  try {
    const parsed: unknown = JSON.parse(responsibleDepartments);
    return (
      Array.isArray(parsed) && parsed.includes(CORRUPTED_RESPONSIBLE_DEPARTMENT)
    );
  } catch {
    return false;
  }
}

function createCandidate(options: {
  departmentsByName: Map<string, CanonicalIdentity>;
  responsibilityType: InspectionIssueResponsibilityType;
  source: 'inspection' | 'request';
  supplier?: CanonicalIdentity | null;
}) {
  const name =
    options.responsibilityType === INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER
      ? INCOMING_INSPECTION_RESPONSIBLE_DEPARTMENT
      : OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT;
  const department = options.departmentsByName.get(name);
  const isExternal =
    options.responsibilityType !==
    INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT;
  if (!department || (isExternal && !options.supplier)) return null;
  return {
    department,
    responsibilityType: options.responsibilityType,
    source: options.source,
    supplier: options.supplier ?? null,
  };
}

export function resolveCorruptedIssueResponsibility(options: {
  candidates: ResponsibilityCandidate[];
  existingDepartment: CanonicalIdentity | null;
  existingResponsibilityType: null | string;
  existingSupplierId: null | string;
  existingSupplierName: null | string;
}): CorruptedIssueResponsibilityResolution {
  const existingSupplierId = options.existingSupplierId ?? null;
  const existingSupplierName = options.existingSupplierName ?? null;
  const hasIncompleteSupplierSnapshot =
    Boolean(existingSupplierId) !== Boolean(existingSupplierName);
  if (options.existingDepartment) {
    const matchingCandidates = [
      ...new Map(
        options.candidates
          .filter(
            (candidate) =>
              candidate.department.id === options.existingDepartment.id,
          )
          .map((candidate) => [
            `${candidate.responsibilityType}:${candidate.supplier?.id ?? ''}`,
            candidate,
          ]),
      ).values(),
    ];
    if (matchingCandidates.length > 1) {
      return {
        action: 'unresolved',
        reason: 'CONFLICTING_CANONICAL_RESPONSIBILITY_EVIDENCE',
      };
    }
    const candidate = matchingCandidates[0];
    const responsibilityType =
      candidate?.responsibilityType ??
      INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT;
    if (
      candidate?.supplier &&
      (hasIncompleteSupplierSnapshot ||
        (existingSupplierId !== null &&
          existingSupplierId !== candidate.supplier.id))
    ) {
      return {
        action: 'unresolved',
        reason: 'CONFLICTING_CANONICAL_RESPONSIBILITY_EVIDENCE',
      };
    }
    if (
      options.existingResponsibilityType &&
      options.existingResponsibilityType !== responsibilityType
    ) {
      return {
        action: 'unresolved',
        reason: 'CONFLICTING_RESPONSIBILITY_TYPE',
      };
    }
    return {
      action: 'resolved',
      department: options.existingDepartment,
      responsibilityType,
      source: 'CANONICAL_DEPARTMENT_ID',
      supplier: candidate?.supplier ?? null,
    };
  }

  const candidatesByKey = new Map(
    options.candidates.map((candidate) => [
      `${candidate.department.id}:${candidate.responsibilityType}:${candidate.supplier?.id ?? ''}`,
      candidate,
    ]),
  );
  if (candidatesByKey.size === 0) {
    return {
      action: 'unresolved',
      reason: 'MISSING_CANONICAL_RESPONSIBILITY_EVIDENCE',
    };
  }
  if (candidatesByKey.size > 1) {
    return {
      action: 'unresolved',
      reason: 'CONFLICTING_CANONICAL_RESPONSIBILITY_EVIDENCE',
    };
  }
  const candidate = [...candidatesByKey.values()][0];
  if (!candidate) {
    return {
      action: 'unresolved',
      reason: 'MISSING_CANONICAL_RESPONSIBILITY_EVIDENCE',
    };
  }
  if (
    options.existingResponsibilityType &&
    options.existingResponsibilityType !== candidate.responsibilityType
  ) {
    return { action: 'unresolved', reason: 'CONFLICTING_RESPONSIBILITY_TYPE' };
  }
  if (
    candidate.supplier &&
    (hasIncompleteSupplierSnapshot ||
      (existingSupplierId !== null &&
        existingSupplierId !== candidate.supplier.id))
  ) {
    return {
      action: 'unresolved',
      reason: 'CONFLICTING_CANONICAL_RESPONSIBILITY_EVIDENCE',
    };
  }
  return {
    action: 'resolved',
    department: candidate.department,
    responsibilityType: candidate.responsibilityType,
    source: 'RELATED_INSPECTION_OR_REQUEST',
    supplier: candidate.supplier,
  };
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

function activeSupplierFromTeam(
  teamId: null | string,
  supplierByTeamId: Map<string, CanonicalIdentity>,
) {
  return teamId ? supplierByTeamId.get(teamId) || null : null;
}

function buildCandidates(options: {
  departmentsByName: Map<string, CanonicalIdentity>;
  inspection: null | {
    category: inspection_category;
    supplier: null | { id: string; isDeleted: boolean; name: string };
    supplierId: null | string;
    teamId: null | string;
  };
  requests: Array<{
    category: inspection_category | null;
    inspection: null | {
      category: inspection_category;
      supplier: null | { id: string; isDeleted: boolean; name: string };
      supplierId: null | string;
      teamId: null | string;
    };
    inspectionLinks: Array<{
      inspection: {
        category: inspection_category;
        supplier: null | { id: string; isDeleted: boolean; name: string };
        supplierId: null | string;
        teamId: null | string;
      };
    }>;
    supplier: null | { id: string; isDeleted: boolean; name: string };
    supplierId: null | string;
    teamId: null | string;
  }>;
  supplierByTeamId: Map<string, CanonicalIdentity>;
}) {
  const candidates: ResponsibilityCandidate[] = [];
  const addInspectionCandidate = (
    inspection: null | {
      category: inspection_category;
      supplier: null | { id: string; isDeleted: boolean; name: string };
      supplierId: null | string;
      teamId: null | string;
    },
    source: 'inspection' | 'request',
  ) => {
    if (!inspection) return;
    let supplier: CanonicalIdentity | null = null;
    if (inspection.category === 'INCOMING') {
      supplier = activeIdentity(inspection.supplierId, inspection.supplier);
    } else if (inspection.category === 'PROCESS') {
      supplier = activeSupplierFromTeam(
        inspection.teamId,
        options.supplierByTeamId,
      );
    }
    if (!supplier) return;
    const responsibilityType =
      inspection.category === 'INCOMING'
        ? INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER
        : INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT;
    const candidate = createCandidate({
      departmentsByName: options.departmentsByName,
      responsibilityType,
      source,
      supplier,
    });
    if (candidate) candidates.push(candidate);
  };

  addInspectionCandidate(options.inspection, 'inspection');
  for (const request of options.requests) {
    const requestSupplier = activeIdentity(
      request.supplierId,
      request.supplier,
    );
    const teamSupplier = activeSupplierFromTeam(
      request.teamId,
      options.supplierByTeamId,
    );
    if (request.category === 'INCOMING' && requestSupplier) {
      const candidate = createCandidate({
        departmentsByName: options.departmentsByName,
        responsibilityType: INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER,
        source: 'request',
        supplier: requestSupplier,
      });
      if (candidate) candidates.push(candidate);
    }
    if (request.category === 'PROCESS' && teamSupplier) {
      const candidate = createCandidate({
        departmentsByName: options.departmentsByName,
        responsibilityType:
          INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT,
        source: 'request',
        supplier: teamSupplier,
      });
      if (candidate) candidates.push(candidate);
    }
    addInspectionCandidate(request.inspection, 'request');
    request.inspectionLinks.forEach((link) =>
      addInspectionCandidate(link.inspection, 'request'),
    );
  }
  return candidates;
}

function buildAuditEvidence(options: {
  candidates: ResponsibilityCandidate[];
  issue: {
    inspectionId: null | string;
    responsibilityType: null | string;
    responsibleDepartments: null | string;
  };
  requestIds: string[];
}) {
  return {
    candidateKeys: options.candidates
      .map(
        (candidate) =>
          `${candidate.department.id}:${candidate.responsibilityType}:${candidate.supplier?.id ?? ''}:${candidate.supplier?.name ?? ''}:${candidate.source}`,
      )
      .sort()
      .join(','),
    inspectionId: options.issue.inspectionId,
    responsibilityType: options.issue.responsibilityType,
    responsibleDepartments: options.issue.responsibleDepartments,
    requestIds: options.requestIds.sort().join(','),
  };
}

async function loadContext() {
  const departments = await prisma.departments.findMany({
    where: { isDeleted: false, status: 1 },
    select: { id: true, name: true },
  });
  const departmentById = new Map(departments.map((item) => [item.id, item]));
  const departmentGroups = new Map<string, CanonicalIdentity[]>();
  for (const department of departments) {
    const values = departmentGroups.get(department.name) || [];
    values.push(department);
    departmentGroups.set(department.name, values);
  }
  const departmentByName = new Map(
    [...departmentGroups].flatMap(([name, values]) =>
      values.length === 1 && values[0] ? [[name, values[0]] as const] : [],
    ),
  );
  return { departmentById, departmentByName };
}

async function persistAudits(
  client: Prisma.TransactionClient,
  inputs: AuditInput[],
) {
  for (const input of inputs) {
    if (input.type === 'resolved') {
      await client.unresolved_master_data_refs.updateMany({
        where: {
          entityId: input.entityId,
          entityType: 'quality_records',
          fieldName: 'responsibleDepartmentId',
          isDeleted: false,
          status: 'OPEN',
        },
        data: {
          evidence: input.evidence,
          resolutionNote:
            'Resolved by corrupted inspection issue responsibility remediation',
          resolvedAt: new Date(),
          resolvedId: input.resolvedId,
          status: 'RESOLVED',
        },
      });
      continue;
    }
    await client.unresolved_master_data_refs.upsert({
      where: {
        entityType_entityId_fieldName: {
          entityId: input.entityId,
          entityType: 'quality_records',
          fieldName: 'responsibleDepartmentId',
        },
      },
      create: {
        entityId: input.entityId,
        entityType: 'quality_records',
        evidence: input.evidence,
        fieldName: 'responsibleDepartmentId',
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
        resolvedAt: null,
        resolvedId: null,
        resolutionNote: null,
        status: 'OPEN',
      },
    });
  }
}

export async function remediateCorruptedInspectionIssueResponsibilities(
  options: InspectionIssueResponsibilityRemediationOptions,
): Promise<InspectionIssueResponsibilityRemediationSummary> {
  const context = await loadContext();
  const summary: InspectionIssueResponsibilityRemediationSummary = {
    batches: 0,
    concurrentChanges: 0,
    conflicts: 0,
    mode: options.mode,
    plannedOrUpdated: 0,
    processed: 0,
    skipped: 0,
    unresolved: 0,
  };
  let cursorId: string | undefined;

  while (!options.maxBatches || summary.batches < options.maxBatches) {
    const issues = await prisma.quality_records.findMany({
      where: {
        isDeleted: false,
        OR: [
          { responsibleDepartment: CORRUPTED_RESPONSIBLE_DEPARTMENT },
          {
            responsibleDepartments: {
              contains: CORRUPTED_RESPONSIBLE_DEPARTMENT,
            },
          },
        ],
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: options.batchSize,
      select: {
        id: true,
        inspection: {
          select: {
            category: true,
            supplier: { select: { id: true, isDeleted: true, name: true } },
            supplierId: true,
            teamId: true,
          },
        },
        inspectionId: true,
        responsibilityType: true,
        responsibleDepartment: true,
        responsibleDepartmentId: true,
        responsibleDepartments: true,
        supplierId: true,
        supplierName: true,
      },
    });
    if (issues.length === 0) break;
    summary.batches += 1;
    summary.processed += issues.length;
    cursorId = issues.at(-1)?.id;
    const requests = await prisma.qms_inspection_requests.findMany({
      where: {
        isDeleted: false,
        linkedIssueId: { in: issues.map((issue) => issue.id) },
      },
      select: {
        id: true,
        category: true,
        inspection: {
          select: {
            category: true,
            supplier: { select: { id: true, isDeleted: true, name: true } },
            supplierId: true,
            teamId: true,
          },
        },
        inspectionLinks: {
          select: {
            inspection: {
              select: {
                category: true,
                supplier: { select: { id: true, isDeleted: true, name: true } },
                supplierId: true,
                teamId: true,
              },
            },
          },
        },
        linkedIssueId: true,
        supplier: { select: { id: true, isDeleted: true, name: true } },
        supplierId: true,
        teamId: true,
      },
    });
    const requestsByIssueId = new Map<string, typeof requests>();
    for (const request of requests) {
      if (!request.linkedIssueId) continue;
      const values = requestsByIssueId.get(request.linkedIssueId) || [];
      values.push(request);
      requestsByIssueId.set(request.linkedIssueId, values);
    }
    const supplierByTeamId =
      await SupplierIdentityService.resolveSuppliersByTeamIds([
        ...issues.map((issue) => issue.inspection?.teamId),
        ...requests.flatMap((request) => [
          request.teamId,
          request.inspection?.teamId,
          ...request.inspectionLinks.map((link) => link.inspection.teamId),
        ]),
      ]);
    const updates: RemediationUpdate[] = [];
    const unresolvedAudits: AuditInput[] = [];

    for (const issue of issues) {
      if (
        !hasCorruptedResponsibleDepartment(
          issue.responsibleDepartment,
          issue.responsibleDepartments,
        )
      ) {
        summary.skipped += 1;
        continue;
      }
      const relatedRequests = requestsByIssueId.get(issue.id) || [];
      const candidates = buildCandidates({
        departmentsByName: context.departmentByName,
        inspection: issue.inspection,
        requests: relatedRequests,
        supplierByTeamId,
      });
      const existingDepartment = issue.responsibleDepartmentId
        ? context.departmentById.get(issue.responsibleDepartmentId) || null
        : null;
      const resolution = resolveCorruptedIssueResponsibility({
        candidates,
        existingDepartment,
        existingResponsibilityType: issue.responsibilityType,
        existingSupplierId: issue.supplierId ?? null,
        existingSupplierName: issue.supplierName ?? null,
      });
      const rawName =
        issue.responsibleDepartment === CORRUPTED_RESPONSIBLE_DEPARTMENT
          ? issue.responsibleDepartment
          : CORRUPTED_RESPONSIBLE_DEPARTMENT;
      const evidence = buildAuditEvidence({
        candidates,
        issue,
        requestIds: relatedRequests.map((request) => request.id),
      });
      if (resolution.action === 'unresolved') {
        summary.unresolved += 1;
        if (resolution.reason.startsWith('CONFLICTING_'))
          summary.conflicts += 1;
        unresolvedAudits.push({
          entityId: issue.id,
          evidence,
          rawId: issue.responsibleDepartmentId,
          rawName,
          reason: resolution.reason,
          type: 'unresolved',
        });
        continue;
      }
      const targetDepartments = JSON.stringify([resolution.department.name]);
      const isCanonical =
        issue.responsibleDepartment === resolution.department.name &&
        issue.responsibleDepartmentId === resolution.department.id &&
        issue.responsibleDepartments === targetDepartments &&
        issue.responsibilityType === resolution.responsibilityType &&
        (issue.supplierId ?? null) === (resolution.supplier?.id ?? null) &&
        (issue.supplierName ?? null) === (resolution.supplier?.name ?? null);
      if (isCanonical) {
        summary.skipped += 1;
        continue;
      }
      updates.push({
        department: resolution.department,
        existing: {
          responsibilityType: issue.responsibilityType,
          responsibleDepartment: issue.responsibleDepartment,
          responsibleDepartmentId: issue.responsibleDepartmentId,
          responsibleDepartments: issue.responsibleDepartments,
          supplierId: issue.supplierId ?? null,
          supplierName: issue.supplierName ?? null,
        },
        id: issue.id,
        responsibilityType: resolution.responsibilityType,
        supplier: resolution.supplier,
      });
    }

    if (options.mode === 'dry-run') {
      summary.plannedOrUpdated += updates.length;
    } else {
      const results = await prisma.$transaction(async (tx) => {
        const applied: Array<{ audit: AuditInput; count: number }> = [];
        for (const update of updates) {
          const result = await tx.quality_records.updateMany({
            where: { id: update.id, isDeleted: false, ...update.existing },
            data: {
              responsibleDepartment: update.department.name,
              responsibleDepartmentId: update.department.id,
              responsibleDepartments: JSON.stringify([update.department.name]),
              responsibilityType: update.responsibilityType,
              supplierId: update.supplier?.id ?? null,
              supplierName: update.supplier?.name ?? null,
            },
          });
          applied.push({
            audit: {
              entityId: update.id,
              evidence: {
                supplierId: update.supplier?.id ?? null,
                supplierName: update.supplier?.name ?? null,
              },
              rawId: update.existing.responsibleDepartmentId,
              rawName: update.existing.responsibleDepartment,
              reason: update.supplier
                ? 'RESOLVED_EXTERNAL_RESPONSIBILITY'
                : 'RESOLVED_INTERNAL_RESPONSIBILITY',
              resolvedId: update.department.id,
              type: 'resolved',
            },
            count: result.count,
          });
        }
        await persistAudits(tx, [
          ...unresolvedAudits,
          ...applied
            .filter((item) => item.count === 1)
            .map((item) => item.audit),
        ]);
        return applied;
      });
      const applied = results.filter((result) => result.count === 1).length;
      summary.plannedOrUpdated += applied;
      summary.concurrentChanges += updates.length - applied;
    }

    logger.info(
      {
        batch: summary.batches,
        cursorId,
        plannedOrUpdated: updates.length,
        processed: issues.length,
      },
      'corrupted inspection issue responsibility remediation batch finished',
    );
  }

  return summary;
}
