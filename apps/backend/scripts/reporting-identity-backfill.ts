import prisma from '~/utils/prisma';

type CanonicalIdentity = { id: string; name: string };
type IdentityMatch =
  | {
      candidateIds: string[];
      reason: 'AMBIGUOUS_CANONICAL_NAME' | 'NO_ACTIVE_CANONICAL_MATCH';
      status: 'unresolved';
    }
  | {
      identity: CanonicalIdentity;
      matchedBy: 'id' | 'name';
      status: 'resolved';
    };

interface MissingIdentityRow {
  entityId: string;
  rawName: null | string;
}

interface IdentityTarget {
  entityType: string;
  fieldName: 'projectId' | 'respDeptId' | 'responsibleDepartmentId';
  findBatch: (
    cursor: string | undefined,
    batchSize: number,
  ) => Promise<MissingIdentityRow[]>;
  update: (
    row: MissingIdentityRow,
    identity: CanonicalIdentity,
    normalizeSnapshot: boolean,
  ) => Promise<number>;
}

interface IdentityContext {
  ambiguousIdsByName: Map<string, string[]>;
  byId: Map<string, CanonicalIdentity>;
  byName: Map<string, CanonicalIdentity>;
}

export interface ReportingIdentityBackfillSummary {
  concurrentChanges: number;
  processed: number;
  unresolved: number;
  updated: number;
}

function normalizeText(value: null | string | undefined) {
  return String(value || '').trim();
}

export function buildIdentityContext(
  identities: CanonicalIdentity[],
): IdentityContext {
  const byId = new Map<string, CanonicalIdentity>();
  const groupedByName = new Map<string, CanonicalIdentity[]>();
  for (const identity of identities) {
    const id = normalizeText(identity.id);
    const name = normalizeText(identity.name);
    if (!id || !name) continue;
    const normalized = { id, name };
    byId.set(id, normalized);
    const sameName = groupedByName.get(name) || [];
    sameName.push(normalized);
    groupedByName.set(name, sameName);
  }
  const byName = new Map<string, CanonicalIdentity>();
  const ambiguousIdsByName = new Map<string, string[]>();
  for (const [name, matches] of groupedByName) {
    const candidate = matches[0];
    if (matches.length === 1 && candidate) {
      byName.set(name, candidate);
    } else {
      ambiguousIdsByName.set(
        name,
        matches.map((item) => item.id),
      );
    }
  }
  return { ambiguousIdsByName, byId, byName };
}

export function resolveCanonicalIdentity(
  rawName: null | string,
  context: IdentityContext,
): IdentityMatch {
  const normalized = normalizeText(rawName);
  const byId = context.byId.get(normalized);
  if (byId) {
    return { identity: byId, matchedBy: 'id', status: 'resolved' };
  }
  const ambiguousIds = context.ambiguousIdsByName.get(normalized);
  if (ambiguousIds) {
    return {
      candidateIds: ambiguousIds,
      reason: 'AMBIGUOUS_CANONICAL_NAME',
      status: 'unresolved',
    };
  }
  const byName = context.byName.get(normalized);
  if (byName) {
    return { identity: byName, matchedBy: 'name', status: 'resolved' };
  }
  return {
    candidateIds: [],
    reason: 'NO_ACTIVE_CANONICAL_MATCH',
    status: 'unresolved',
  };
}

async function recordUnresolved(
  target: IdentityTarget,
  row: MissingIdentityRow,
  match: Extract<IdentityMatch, { status: 'unresolved' }>,
) {
  await prisma.unresolved_master_data_refs.upsert({
    where: {
      entityType_entityId_fieldName: {
        entityId: row.entityId,
        entityType: target.entityType,
        fieldName: target.fieldName,
      },
    },
    create: {
      entityId: row.entityId,
      entityType: target.entityType,
      evidence: { candidateIds: match.candidateIds },
      fieldName: target.fieldName,
      rawName: row.rawName,
      reason: match.reason,
    },
    update: {
      evidence: { candidateIds: match.candidateIds },
      isDeleted: false,
      rawId: null,
      rawName: row.rawName,
      reason: match.reason,
      resolutionNote: null,
      resolvedAt: null,
      resolvedId: null,
      status: 'OPEN',
    },
  });
}

async function resolveAudit(
  target: IdentityTarget,
  row: MissingIdentityRow,
  resolvedId: string,
) {
  await prisma.unresolved_master_data_refs.updateMany({
    where: {
      entityId: row.entityId,
      entityType: target.entityType,
      fieldName: target.fieldName,
      isDeleted: false,
      status: 'OPEN',
    },
    data: {
      resolutionNote: 'Resolved by deterministic reporting identity backfill',
      resolvedAt: new Date(),
      resolvedId,
      status: 'RESOLVED',
    },
  });
}

async function runTargets(
  context: IdentityContext,
  targets: IdentityTarget[],
  batchSize: number,
): Promise<ReportingIdentityBackfillSummary> {
  const summary: ReportingIdentityBackfillSummary = {
    concurrentChanges: 0,
    processed: 0,
    unresolved: 0,
    updated: 0,
  };
  for (const target of targets) {
    let cursor: string | undefined;
    while (true) {
      const rows = await target.findBatch(cursor, batchSize);
      if (rows.length === 0) break;
      for (const row of rows) {
        const match = resolveCanonicalIdentity(row.rawName, context);
        if (match.status === 'unresolved') {
          summary.unresolved += 1;
          await recordUnresolved(target, row, match);
          continue;
        }
        const count = await target.update(
          row,
          match.identity,
          match.matchedBy === 'id',
        );
        summary.updated += count;
        if (count === 0) {
          summary.concurrentChanges += 1;
          continue;
        }
        await resolveAudit(target, row, match.identity.id);
      }
      summary.processed += rows.length;
      cursor = rows.at(-1)?.entityId;
      if (rows.length < batchSize) break;
    }
  }
  return summary;
}

function projectTargets(): IdentityTarget[] {
  return [
    {
      entityType: 'work_orders',
      fieldName: 'projectId',
      findBatch: async (cursor, take) => {
        const rows = await prisma.work_orders.findMany({
          where: {
            isDeleted: false,
            projectId: null,
            projectName: { not: null },
          },
          orderBy: { workOrderNumber: 'asc' },
          ...(cursor ? { cursor: { workOrderNumber: cursor }, skip: 1 } : {}),
          take,
          select: { projectName: true, workOrderNumber: true },
        });
        return rows.map((row) => ({
          entityId: row.workOrderNumber,
          rawName: row.projectName,
        }));
      },
      update: async (row, identity, normalizeSnapshot) => {
        const result = await prisma.work_orders.updateMany({
          where: {
            isDeleted: false,
            projectId: null,
            projectName: row.rawName,
            workOrderNumber: row.entityId,
          },
          data: {
            projectId: identity.id,
            ...(normalizeSnapshot ? { projectName: identity.name } : {}),
          },
        });
        return result.count;
      },
    },
    createIdProjectTarget(
      'inspections',
      (cursor, take) =>
        prisma.inspections.findMany({
          where: {
            isDeleted: false,
            projectId: null,
            projectName: { not: null },
          },
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          take,
          select: { id: true, projectName: true },
        }),
      (row, identity, data) =>
        prisma.inspections.updateMany({
          where: {
            id: row.entityId,
            isDeleted: false,
            projectId: null,
            projectName: row.rawName,
          },
          data: { projectId: identity.id, ...data },
        }),
    ),
    createIdProjectTarget(
      'quality_records',
      (cursor, take) =>
        prisma.quality_records.findMany({
          where: {
            isDeleted: false,
            projectId: null,
            projectName: { not: null },
          },
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          take,
          select: { id: true, projectName: true },
        }),
      (row, identity, data) =>
        prisma.quality_records.updateMany({
          where: {
            id: row.entityId,
            isDeleted: false,
            projectId: null,
            projectName: row.rawName,
          },
          data: { projectId: identity.id, ...data },
        }),
    ),
    createIdProjectTarget(
      'after_sales',
      (cursor, take) =>
        prisma.after_sales.findMany({
          where: {
            isDeleted: false,
            projectId: null,
            projectName: { not: '' },
          },
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          take,
          select: { id: true, projectName: true },
        }),
      (row, identity, data) =>
        prisma.after_sales.updateMany({
          where: {
            id: row.entityId,
            isDeleted: false,
            projectId: null,
            projectName: row.rawName,
          },
          data: { projectId: identity.id, ...data },
        }),
    ),
    createIdProjectTarget(
      'quality_losses',
      (cursor, take) =>
        prisma.quality_losses.findMany({
          where: {
            isDeleted: false,
            projectId: null,
            projectName: { not: null },
          },
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          take,
          select: { id: true, projectName: true },
        }),
      (row, identity, data) =>
        prisma.quality_losses.updateMany({
          where: {
            id: row.entityId,
            isDeleted: false,
            projectId: null,
            projectName: row.rawName,
          },
          data: { projectId: identity.id, ...data },
        }),
    ),
    createIdProjectTarget(
      'vehicle_commissioning_issues',
      (cursor, take) =>
        prisma.vehicle_commissioning_issues.findMany({
          where: {
            isDeleted: false,
            projectId: null,
            projectName: { not: null },
          },
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          take,
          select: { id: true, projectName: true },
        }),
      (row, identity, data) =>
        prisma.vehicle_commissioning_issues.updateMany({
          where: {
            id: row.entityId,
            isDeleted: false,
            projectId: null,
            projectName: row.rawName,
          },
          data: { projectId: identity.id, ...data },
        }),
    ),
  ];
}

function createIdProjectTarget(
  entityType: string,
  findMany: (
    cursor: string | undefined,
    take: number,
  ) => Promise<Array<{ id: string; projectName: null | string }>>,
  updateMany: (
    row: MissingIdentityRow,
    identity: CanonicalIdentity,
    data: { projectName?: string },
  ) => Promise<{ count: number }>,
): IdentityTarget {
  return {
    entityType,
    fieldName: 'projectId',
    findBatch: async (cursor, take) => {
      const rows = await findMany(cursor, take);
      return rows.map((row) => ({
        entityId: row.id,
        rawName: row.projectName,
      }));
    },
    update: async (row, identity, normalizeSnapshot) => {
      const result = await updateMany(
        row,
        identity,
        normalizeSnapshot ? { projectName: identity.name } : {},
      );
      return result.count;
    },
  };
}

function departmentTargets(): IdentityTarget[] {
  return [
    createDepartmentTarget(
      'after_sales',
      'respDeptId',
      (cursor, take) =>
        prisma.after_sales.findMany({
          where: {
            isDeleted: false,
            respDept: { not: null },
            respDeptId: null,
          },
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          take,
          select: { id: true, respDept: true },
        }),
      (row, identity, data) =>
        prisma.after_sales.updateMany({
          where: {
            id: row.entityId,
            isDeleted: false,
            respDept: row.rawName,
            respDeptId: null,
          },
          data: { respDeptId: identity.id, ...data },
        }),
    ),
    createDepartmentTarget(
      'quality_losses',
      'respDeptId',
      (cursor, take) =>
        prisma.quality_losses.findMany({
          where: {
            isDeleted: false,
            respDept: { not: null },
            respDeptId: null,
          },
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          take,
          select: { id: true, respDept: true },
        }),
      (row, identity, data) =>
        prisma.quality_losses.updateMany({
          where: {
            id: row.entityId,
            isDeleted: false,
            respDept: row.rawName,
            respDeptId: null,
          },
          data: { respDeptId: identity.id, ...data },
        }),
    ),
    createDepartmentTarget(
      'quality_records',
      'responsibleDepartmentId',
      (cursor, take) =>
        prisma.quality_records.findMany({
          where: {
            isDeleted: false,
            responsibleDepartment: { not: '' },
            responsibleDepartmentId: null,
          },
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          take,
          select: { id: true, responsibleDepartment: true },
        }),
      (row, identity, data) =>
        prisma.quality_records.updateMany({
          where: {
            id: row.entityId,
            isDeleted: false,
            responsibleDepartment: row.rawName,
            responsibleDepartmentId: null,
          },
          data: { responsibleDepartmentId: identity.id, ...data },
        }),
    ),
    createDepartmentTarget(
      'vehicle_commissioning_issues',
      'responsibleDepartmentId',
      (cursor, take) =>
        prisma.vehicle_commissioning_issues.findMany({
          where: {
            isDeleted: false,
            responsibleDepartment: { not: null },
            responsibleDepartmentId: null,
          },
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          take,
          select: { id: true, responsibleDepartment: true },
        }),
      (row, identity, data) =>
        prisma.vehicle_commissioning_issues.updateMany({
          where: {
            id: row.entityId,
            isDeleted: false,
            responsibleDepartment: row.rawName,
            responsibleDepartmentId: null,
          },
          data: { responsibleDepartmentId: identity.id, ...data },
        }),
    ),
  ];
}

function createDepartmentTarget(
  entityType: string,
  fieldName: 'respDeptId' | 'responsibleDepartmentId',
  findMany: (
    cursor: string | undefined,
    take: number,
  ) => Promise<
    Array<{
      id: string;
      respDept?: null | string;
      responsibleDepartment?: null | string;
    }>
  >,
  updateMany: (
    row: MissingIdentityRow,
    identity: CanonicalIdentity,
    data: { respDept?: string; responsibleDepartment?: string },
  ) => Promise<{ count: number }>,
): IdentityTarget {
  return {
    entityType,
    fieldName,
    findBatch: async (cursor, take) => {
      const rows = await findMany(cursor, take);
      return rows.map((row) => ({
        entityId: row.id,
        rawName: row.respDept ?? row.responsibleDepartment ?? null,
      }));
    },
    update: async (row, identity, normalizeSnapshot) => {
      let data: { respDept?: string; responsibleDepartment?: string } = {};
      if (normalizeSnapshot) {
        data =
          fieldName === 'respDeptId'
            ? { respDept: identity.name }
            : { responsibleDepartment: identity.name };
      }
      const result = await updateMany(row, identity, data);
      return result.count;
    },
  };
}

export async function backfillReportingProjectIdentities(
  options: { batchSize?: number } = {},
) {
  const batchSize = Math.min(Math.max(options.batchSize ?? 200, 1), 1000);
  const projects = await prisma.master_projects.findMany({
    where: { isDeleted: false },
    select: { id: true, name: true },
  });
  return runTargets(
    buildIdentityContext(projects),
    projectTargets(),
    batchSize,
  );
}

export async function backfillQualityLossSourceDepartmentIdentities(
  options: { batchSize?: number } = {},
) {
  const batchSize = Math.min(Math.max(options.batchSize ?? 200, 1), 1000);
  const departments = await prisma.departments.findMany({
    where: { isDeleted: false },
    select: { id: true, name: true },
  });
  return runTargets(
    buildIdentityContext(departments),
    departmentTargets(),
    batchSize,
  );
}
