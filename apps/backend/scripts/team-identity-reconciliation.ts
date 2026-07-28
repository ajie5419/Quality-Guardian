import type {
  ReconciliationSource,
  ReconciliationTeam,
  TeamSourceCandidate,
} from './team-identity-reconciliation-plan';

import { createHash } from 'node:crypto';

import { resolveSupplierInspectionPolicy } from '@qgs/shared';
import {
  buildTeamIdentityNameKey,
  normalizeDisplayName,
} from '~/modules/team/team-identity-write';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import {
  chooseTeamForSource,
  findAmbiguousTeamGroups,
  sourceKey,
} from './team-identity-reconciliation-plan';

export type TeamIdentityReconciliationMode = 'apply' | 'dry-run';

export interface TeamIdentityReconciliationOptions {
  mode: TeamIdentityReconciliationMode;
}

export function parseTeamIdentityReconciliationOptions(
  args: string[],
): TeamIdentityReconciliationOptions {
  let mode: TeamIdentityReconciliationMode = 'dry-run';
  for (const arg of args) {
    if (arg === '--apply') mode = 'apply';
    else if (arg === '--dry-run') mode = 'dry-run';
    else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { mode };
}

interface ReconciliationAudit {
  entityId: string;
  evidence: Record<string, string | string[]>;
  rawId: null | string;
  rawName: null | string;
  reason: string;
}

const TEAM_DICT_TYPE = 'team';
const OPERATOR = 'system:team-identity-reconciliation';
const SUPPLIER_SORT_OFFSET = 10_000;
const AUDIT_ENTITY_TYPE = 'team_identity_reconciliation';
const AUDIT_FIELD_NAME = 'teamId';
const logger = createModuleLogger('team-identity-reconciliation');

function auditEntityId(prefix: string, value: string) {
  const hash = createHash('sha256').update(value).digest('hex').slice(0, 24);
  return `${prefix}:${hash}`;
}

export function collectTeamSourceCandidates(
  departments: Array<{
    id: string;
    name: string;
    parentId: string;
    sort: number;
  }>,
  suppliers: Array<{
    category: null | string;
    id: string;
    name: string;
    outsourcingMode: null | string;
  }>,
) {
  const candidates: TeamSourceCandidate[] = [];
  const parentIds = new Set(
    departments.map((department) => department.parentId),
  );
  for (const department of departments) {
    const name = normalizeDisplayName(department.name);
    if (!name || parentIds.has(department.id)) continue;
    candidates.push({
      name,
      sort: department.sort,
      sourceId: department.id,
      sourceType: 'DEPARTMENT',
    });
  }
  suppliers.forEach((supplier, index) => {
    if (resolveSupplierInspectionPolicy(supplier).identitySource !== 'team') {
      return;
    }
    const name = normalizeDisplayName(supplier.name);
    if (!name) return;
    candidates.push({
      name,
      sort: SUPPLIER_SORT_OFFSET + index,
      sourceId: supplier.id,
      sourceType: 'SUPPLIER',
    });
  });
  return candidates.sort(
    (left, right) =>
      left.sort - right.sort || sourceKey(left).localeCompare(sourceKey(right)),
  );
}

function parseLegacySources(remark: null | string, teamId: string) {
  if (!remark) return [];
  try {
    const parsed: unknown = JSON.parse(remark);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('sources' in parsed) ||
      !('managedBy' in parsed) ||
      parsed.managedBy !== 'system:team-dictionary-bootstrap'
    ) {
      return [];
    }
    const sources = (parsed as { sources?: unknown }).sources;
    return Array.isArray(sources)
      ? sources.filter(
          (source): source is string =>
            typeof source === 'string' &&
            /^(?:department|supplier):[^:]+$/u.test(source),
        )
      : [];
  } catch (error: unknown) {
    logger.warn({ err: error, teamId }, 'ignored invalid legacy TEAM remark');
    return [];
  }
}

export function buildLegacySourceClaims(
  teams: Array<{ id: string; remark: null | string }>,
) {
  const claims = new Map<string, string[]>();
  for (const team of teams) {
    const sources = [
      ...new Set(
        parseLegacySources(team.remark, team.id).map((source) =>
          source
            .replace(/^department:/u, 'DEPARTMENT:')
            .replace(/^supplier:/u, 'SUPPLIER:'),
        ),
      ),
    ];
    // A multi-source bootstrap remark only proves that names were coalesced;
    // it cannot prove that the source identities are the same TEAM.
    if (sources.length !== 1) continue;
    for (const normalized of sources) {
      const ids = claims.get(normalized) || [];
      ids.push(team.id);
      claims.set(normalized, ids);
    }
  }
  return claims;
}

async function loadSourceCandidates() {
  const [departments, suppliers] = await Promise.all([
    prisma.departments.findMany({
      where: { isDeleted: false, status: 1 },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, parentId: true, sort: true },
    }),
    prisma.suppliers.findMany({
      where: { isDeleted: false },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: {
        category: true,
        id: true,
        name: true,
        outsourcingMode: true,
      },
    }),
  ]);
  return collectTeamSourceCandidates(departments, suppliers);
}

async function loadReconciliationState() {
  const [teams, sources, supplierLinks] = await Promise.all([
    prisma.dictionaries.findMany({
      where: { dictType: TEAM_DICT_TYPE, isDeleted: false },
      select: { dictKey: true, id: true, remark: true, status: true },
    }),
    prisma.team_identity_sources.findMany(),
    prisma.supplier_identity_links.findMany({
      where: { identityType: 'TEAM', isDeleted: false },
      select: { identityId: true },
    }),
  ]);
  return {
    sourceRows: sources,
    supplierLinkedTeamIds: new Set(
      supplierLinks.map((link) => link.identityId),
    ),
    teamRows: teams,
    teams: teams.map((team) => ({
      id: team.id,
      name: team.dictKey,
      status: team.status,
    })),
  };
}

async function createTeamForSource(candidate: TeamSourceCandidate) {
  return prisma.$transaction(async (tx) => {
    const team = await tx.dictionaries.create({
      data: {
        createdBy: OPERATOR,
        dictKey: candidate.name,
        dictType: TEAM_DICT_TYPE,
        dictValue: candidate.name,
        isDeleted: false,
        isSystem: false,
        remark: JSON.stringify({
          managedBy: OPERATOR,
          sources: [sourceKey(candidate)],
        }),
        sort: candidate.sort,
        status: 1,
        updatedBy: OPERATOR,
      },
      select: { id: true },
    });
    const nameKey = buildTeamIdentityNameKey(candidate.name);
    await tx.team_identity_name_keys.create({
      data: { createdBy: OPERATOR, nameKey, teamId: team.id },
    });
    await tx.team_identity_aliases.create({
      data: {
        alias: candidate.name,
        aliasKind: 'CANONICAL',
        createdBy: OPERATOR,
        nameKey,
        teamId: team.id,
      },
    });
    await tx.team_identity_sources.create({
      data: {
        createdBy: OPERATOR,
        sourceId: candidate.sourceId,
        sourceNameSnapshot: candidate.name,
        sourceType: candidate.sourceType,
        teamId: team.id,
      },
    });
    return team.id;
  });
}

async function linkSource(candidate: TeamSourceCandidate, teamId: string) {
  return prisma.team_identity_sources.upsert({
    where: {
      sourceType_sourceId: {
        sourceId: candidate.sourceId,
        sourceType: candidate.sourceType,
      },
    },
    create: {
      createdBy: OPERATOR,
      sourceId: candidate.sourceId,
      sourceNameSnapshot: candidate.name,
      sourceType: candidate.sourceType,
      teamId,
    },
    update: {
      isDeleted: false,
      sourceNameSnapshot: candidate.name,
      teamId,
    },
  });
}

function updateInMemorySource(
  sources: ReconciliationSource[],
  candidate: TeamSourceCandidate,
  teamId: string,
) {
  const current = sources.find(
    (source) => sourceKey(source) === sourceKey(candidate),
  );
  if (current) {
    current.isDeleted = false;
    current.teamId = teamId;
    return;
  }
  sources.push({
    isDeleted: false,
    sourceId: candidate.sourceId,
    sourceType: candidate.sourceType,
    teamId,
  });
}

function sourceAmbiguityAudit(
  candidate: TeamSourceCandidate,
  teamIds: string[],
): ReconciliationAudit {
  return {
    entityId: auditEntityId('source', sourceKey(candidate)),
    evidence: { source: sourceKey(candidate), teamIds },
    rawId: candidate.sourceId,
    rawName: candidate.name,
    reason: 'ambiguous_team_source_identity',
  };
}

async function reconcileSources(
  candidates: TeamSourceCandidate[],
  state: Awaited<ReturnType<typeof loadReconciliationState>>,
  mode: TeamIdentityReconciliationMode,
) {
  const audits: ReconciliationAudit[] = [];
  const claims = buildLegacySourceClaims(state.teamRows);
  let created = 0;
  let linked = 0;
  let retired = 0;
  for (const candidate of candidates) {
    const resolution = chooseTeamForSource(
      candidate,
      state.teams,
      state.sourceRows,
      claims,
    );
    if (resolution.action === 'ambiguous') {
      audits.push(sourceAmbiguityAudit(candidate, resolution.teamIds));
      continue;
    }
    if (resolution.action === 'retired') {
      retired += 1;
      continue;
    }
    let teamId = resolution.action === 'link' ? resolution.teamId : '';
    if (resolution.action === 'create') {
      created += 1;
      teamId =
        mode === 'apply'
          ? await createTeamForSource(candidate)
          : `planned:${sourceKey(candidate)}`;
      state.teams.push({ id: teamId, name: candidate.name, status: 1 });
    } else if (mode === 'apply') {
      await linkSource(candidate, teamId);
    }
    linked += 1;
    updateInMemorySource(state.sourceRows, candidate, teamId);
  }
  return { audits, created, linked, retired };
}

function mergeAmbiguityAudits(
  groups: ReturnType<typeof findAmbiguousTeamGroups>,
  teams: ReconciliationTeam[],
) {
  const namesById = new Map(teams.map((team) => [team.id, team.name]));
  return groups.map(
    (group): ReconciliationAudit => ({
      entityId: auditEntityId('group', group.nameKey),
      evidence: {
        evidenceTeamIds: group.evidenceTeamIds,
        teamIds: group.teamIds,
      },
      rawId: group.teamIds.join(','),
      rawName: group.teamIds
        .map((teamId) => namesById.get(teamId) || teamId)
        .join(' | '),
      reason: 'ambiguous_near_duplicate_team_identities',
    }),
  );
}

async function persistAudits(audits: ReconciliationAudit[]) {
  const openIds = audits.map((audit) => audit.entityId);
  for (const audit of audits) {
    await prisma.unresolved_master_data_refs.upsert({
      where: {
        entityType_entityId_fieldName: {
          entityId: audit.entityId,
          entityType: AUDIT_ENTITY_TYPE,
          fieldName: AUDIT_FIELD_NAME,
        },
      },
      create: {
        ...audit,
        entityType: AUDIT_ENTITY_TYPE,
        fieldName: AUDIT_FIELD_NAME,
      },
      update: {
        evidence: audit.evidence,
        rawId: audit.rawId,
        rawName: audit.rawName,
        reason: audit.reason,
        resolutionNote: null,
        resolvedAt: null,
        resolvedId: null,
        isDeleted: false,
        status: 'OPEN',
      },
    });
  }
  await prisma.unresolved_master_data_refs.updateMany({
    where: {
      entityType: AUDIT_ENTITY_TYPE,
      fieldName: AUDIT_FIELD_NAME,
      isDeleted: false,
      status: 'OPEN',
      ...(openIds.length > 0 ? { entityId: { notIn: openIds } } : {}),
    },
    data: {
      resolutionNote: 'No longer ambiguous after TEAM reconciliation',
      resolvedAt: new Date(),
      status: 'RESOLVED',
    },
  });
}

async function seedActiveAliases() {
  const teams = await prisma.dictionaries.findMany({
    where: { dictType: TEAM_DICT_TYPE, isDeleted: false, status: 1 },
    select: { dictKey: true, id: true },
  });
  const keyCounts = new Map<string, number>();
  for (const team of teams) {
    const key = buildTeamIdentityNameKey(team.dictKey);
    keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
  }
  let seeded = 0;
  for (const team of teams) {
    const nameKey = buildTeamIdentityNameKey(team.dictKey);
    if (keyCounts.get(nameKey) !== 1) continue;
    await prisma.$transaction(async (tx) => {
      await tx.team_identity_name_keys.upsert({
        where: { nameKey },
        create: { createdBy: OPERATOR, nameKey, teamId: team.id },
        update: { teamId: team.id },
      });
      const alias = await tx.team_identity_aliases.findFirst({
        where: { alias: team.dictKey, isDeleted: false, teamId: team.id },
      });
      await (alias
        ? tx.team_identity_aliases.update({
            where: { id: alias.id },
            data: { aliasKind: 'CANONICAL', nameKey },
          })
        : tx.team_identity_aliases.create({
            data: {
              alias: team.dictKey,
              aliasKind: 'CANONICAL',
              createdBy: OPERATOR,
              nameKey,
              teamId: team.id,
            },
          }));
    });
    seeded += 1;
  }
  return seeded;
}

export async function reconcileTeamIdentities(
  options: TeamIdentityReconciliationOptions,
) {
  const candidates = await loadSourceCandidates();
  let state = await loadReconciliationState();
  const sourceResult = await reconcileSources(candidates, state, options.mode);
  if (options.mode === 'apply') state = await loadReconciliationState();
  const ambiguousGroups = findAmbiguousTeamGroups(
    state.teams,
    state.sourceRows,
    state.supplierLinkedTeamIds,
  );
  const ambiguityAudits = [
    ...sourceResult.audits,
    ...mergeAmbiguityAudits(ambiguousGroups, state.teams),
  ];
  if (options.mode === 'apply') await persistAudits(ambiguityAudits);
  const aliasesSeeded =
    options.mode === 'apply' ? await seedActiveAliases() : 0;
  const summary = {
    aliasesSeeded,
    ambiguous: ambiguityAudits.length,
    candidates: candidates.length,
    created: sourceResult.created,
    linked: sourceResult.linked,
    mode: options.mode,
    retired: sourceResult.retired,
  };
  logger.info(summary, 'TEAM identity reconciliation finished');
  return summary;
}
