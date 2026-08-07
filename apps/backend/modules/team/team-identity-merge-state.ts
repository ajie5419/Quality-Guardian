import type { Prisma } from '@prisma/client';

import type { TeamIdentityReferenceCounts } from './team-identity-merge-references';

import { createId } from '@paralleldrive/cuid2';
import { team_identity_merge_status } from '@prisma/client';
import { BusinessError } from '~/utils/business-error';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';

import { createEmptyReferenceCounts } from './team-identity-merge-references';

const TEAM_DICT_TYPE = 'team';
const ACTIVE_STATUS = 1;
const QUARANTINED_STATUS = 2;
const LEASE_DURATION_MS = 5 * 60 * 1000;
const logger = createModuleLogger('TeamIdentityMergeState');

export interface TeamMergeInput {
  operator: string;
  reason: string;
  sourceTeamId: string;
  targetTeamId: string;
  migrateReferences?: boolean;
}

export interface TeamMergeAttempt {
  attemptToken: string;
  auditId: string;
  operator: string;
  sourceName: string;
  sourceTeamId: string;
  targetName: string;
  targetTeamId: string;
  migrateReferences: boolean;
}

export type TeamMergeAcquisition =
  | {
      attempt: TeamMergeAttempt;
      kind: 'acquired';
    }
  | {
      kind: 'completed';
      result: {
        auditId: string;
        counts: TeamIdentityReferenceCounts;
        targetTeamId: string;
      };
    };

export function parseReferenceCounts(value: null | Prisma.JsonValue) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return createEmptyReferenceCounts();
  }
  const counts = createEmptyReferenceCounts();
  for (const key of Object.keys(counts) as Array<keyof typeof counts>) {
    const count = value[key];
    counts[key] = typeof count === 'number' ? count : 0;
  }
  return counts;
}

function leaseUntil() {
  return new Date(Date.now() + LEASE_DURATION_MS);
}

async function lockTeams(tx: Prisma.TransactionClient, teamIds: string[]) {
  for (const teamId of [...new Set(teamIds)].sort()) {
    await tx.$queryRaw`
      SELECT id
      FROM dictionaries
      WHERE id = ${teamId} AND dictType = 'team'
      FOR UPDATE
    `;
  }
}

async function loadMergeTeams(
  tx: Prisma.TransactionClient,
  input: TeamMergeInput,
  allowQuarantinedSource: boolean,
) {
  const teams = await tx.dictionaries.findMany({
    where: {
      id: { in: [input.sourceTeamId, input.targetTeamId] },
      dictType: TEAM_DICT_TYPE,
      isDeleted: false,
    },
    select: { dictKey: true, id: true, isSystem: true, status: true },
  });
  const source = teams.find((team) => team.id === input.sourceTeamId);
  const target = teams.find((team) => team.id === input.targetTeamId);
  const sourceStatuses = allowQuarantinedSource
    ? [ACTIVE_STATUS, QUARANTINED_STATUS]
    : [ACTIVE_STATUS];
  if (!source || !sourceStatuses.includes(source.status)) {
    throw new BusinessError(
      'TEAM_SOURCE_NOT_FOUND',
      'Source TEAM is not active',
      404,
    );
  }
  if (!target || target.status !== ACTIVE_STATUS) {
    throw new BusinessError(
      'TEAM_TARGET_NOT_FOUND',
      'Target TEAM is not active',
      404,
    );
  }
  if (source.isSystem) {
    throw new BusinessError('SYSTEM_TEAM', 'System TEAM cannot be merged', 403);
  }
  return { source, target };
}

async function assertSupplierLinksCompatible(
  tx: Prisma.TransactionClient,
  input: TeamMergeInput,
) {
  const links = await tx.supplier_identity_links.findMany({
    where: {
      identityId: { in: [input.sourceTeamId, input.targetTeamId] },
      identityType: 'TEAM',
      isDeleted: false,
    },
    select: { identityId: true, supplierId: true },
  });
  const source = links.find((link) => link.identityId === input.sourceTeamId);
  const target = links.find((link) => link.identityId === input.targetTeamId);
  if (source && target && source.supplierId !== target.supplierId) {
    throw new BusinessError(
      'TEAM_MERGE_SUPPLIER_CONFLICT',
      'Source and target TEAM identities belong to different suppliers',
      409,
    );
  }
}

async function ensureParticipantLocks(
  tx: Prisma.TransactionClient,
  auditId: string,
  teamIds: string[],
) {
  const locks = await tx.team_identity_merge_participants.findMany({
    where: { teamId: { in: teamIds } },
  });
  if (locks.some((lock) => lock.mergeId !== auditId)) {
    throw new BusinessError(
      'TEAM_MERGE_PARTICIPANT_CONFLICT',
      'A TEAM identity is already part of another merge',
      409,
    );
  }
  const lockedIds = new Set(locks.map((lock) => lock.teamId));
  const missing = teamIds.filter((teamId) => !lockedIds.has(teamId));
  if (missing.length > 0) {
    await tx.team_identity_merge_participants.createMany({
      data: missing.map((teamId) => ({ mergeId: auditId, teamId })),
    });
  }
}

async function assertParticipantsAvailable(
  tx: Prisma.TransactionClient,
  teamIds: string[],
) {
  const lock = await tx.team_identity_merge_participants.findFirst({
    where: { teamId: { in: teamIds } },
    select: { teamId: true },
  });
  if (lock) {
    throw new BusinessError(
      'TEAM_MERGE_PARTICIPANT_CONFLICT',
      'A TEAM identity is already part of another merge',
      409,
    );
  }
}

function completedResult(merge: {
  id: string;
  referenceCounts: null | Prisma.JsonValue;
  targetTeamId: string;
}): TeamMergeAcquisition {
  return {
    kind: 'completed',
    result: {
      auditId: merge.id,
      counts: parseReferenceCounts(merge.referenceCounts),
      targetTeamId: merge.targetTeamId,
    },
  };
}

function assertMergeCanBeClaimed(merge: {
  leaseUntil: Date | null;
  status: team_identity_merge_status;
}) {
  if (
    merge.status === team_identity_merge_status.RUNNING &&
    merge.leaseUntil &&
    merge.leaseUntil > new Date()
  ) {
    throw new BusinessError(
      'TEAM_MERGE_RUNNING',
      'TEAM merge is already being executed',
      409,
    );
  }
  if (merge.status === team_identity_merge_status.CANCELLED) {
    throw new BusinessError(
      'TEAM_MERGE_CANCELLED',
      'TEAM merge was cancelled',
      409,
    );
  }
}

function claimWhere(merge: {
  attemptToken: null | string;
  id: string;
  leaseUntil: Date | null;
  status: team_identity_merge_status;
}): Prisma.team_identity_mergesWhereInput {
  return merge.status === team_identity_merge_status.RUNNING
    ? {
        attemptToken: merge.attemptToken,
        id: merge.id,
        leaseUntil: merge.leaseUntil,
        status: merge.status,
      }
    : { id: merge.id, status: merge.status };
}

async function quarantineSource(
  tx: Prisma.TransactionClient,
  source: { id: string; status: number },
  operator: string,
) {
  if (source.status !== ACTIVE_STATUS) return;
  await tx.dictionaries.update({
    where: { id: source.id },
    data: { status: QUARANTINED_STATUS, updatedBy: operator },
  });
}

function acquiredAttempt(
  attemptToken: string,
  auditId: string,
  input: TeamMergeInput,
  names: { sourceName: string; targetName: string },
  migrateReferences = input.migrateReferences !== false,
): TeamMergeAcquisition {
  return {
    attempt: {
      attemptToken,
      auditId,
      operator: input.operator,
      sourceName: names.sourceName,
      sourceTeamId: input.sourceTeamId,
      targetName: names.targetName,
      targetTeamId: input.targetTeamId,
      migrateReferences,
    },
    kind: 'acquired',
  };
}

async function claimExistingMerge(
  tx: Prisma.TransactionClient,
  input: TeamMergeInput,
  merge: Prisma.team_identity_mergesGetPayload<object>,
): Promise<TeamMergeAcquisition> {
  if (merge.targetTeamId !== input.targetTeamId) {
    throw new BusinessError(
      'TEAM_ALREADY_MERGED',
      'Source TEAM already has a different merge target',
      409,
    );
  }
  if (merge.status === team_identity_merge_status.COMPLETED) {
    return completedResult(merge);
  }
  assertMergeCanBeClaimed(merge);
  const { source, target } = await loadMergeTeams(tx, input, true);
  await assertSupplierLinksCompatible(tx, input);
  await ensureParticipantLocks(tx, merge.id, [source.id, target.id]);
  const attemptToken = createId();
  const claimed = await tx.team_identity_merges.updateMany({
    where: claimWhere(merge),
    data: {
      attemptToken,
      lastError: null,
      leaseUntil: leaseUntil(),
      operator: input.operator,
      reason: input.reason,
      status: team_identity_merge_status.RUNNING,
    },
  });
  if (claimed.count !== 1) {
    throw new BusinessError(
      'TEAM_MERGE_RUNNING',
      'TEAM merge claim changed',
      409,
    );
  }
  await quarantineSource(tx, source, input.operator);
  return acquiredAttempt(
    attemptToken,
    merge.id,
    input,
    {
      sourceName: merge.sourceNameSnapshot,
      targetName: merge.targetNameSnapshot,
    },
    merge.migrateReferences,
  );
}

async function createMerge(
  tx: Prisma.TransactionClient,
  input: TeamMergeInput,
): Promise<TeamMergeAcquisition> {
  const { source, target } = await loadMergeTeams(tx, input, false);
  await assertSupplierLinksCompatible(tx, input);
  await assertParticipantsAvailable(tx, [source.id, target.id]);
  const attemptToken = createId();
  const audit = await tx.team_identity_merges.create({
    data: {
      attemptToken,
      idempotencyKey: `team-merge:${source.id}`,
      leaseUntil: leaseUntil(),
      migrateReferences: input.migrateReferences !== false,
      operator: input.operator,
      reason: input.reason,
      sourceNameSnapshot: source.dictKey,
      sourceTeamId: source.id,
      status: team_identity_merge_status.RUNNING,
      targetNameSnapshot: target.dictKey,
      targetTeamId: target.id,
    },
  });
  await ensureParticipantLocks(tx, audit.id, [source.id, target.id]);
  await quarantineSource(tx, source, input.operator);
  return acquiredAttempt(attemptToken, audit.id, input, {
    sourceName: source.dictKey,
    targetName: target.dictKey,
  });
}

async function acquireInTransaction(
  tx: Prisma.TransactionClient,
  input: TeamMergeInput,
) {
  await lockTeams(tx, [input.sourceTeamId, input.targetTeamId]);
  const previous = await tx.team_identity_merges.findUnique({
    where: { idempotencyKey: `team-merge:${input.sourceTeamId}` },
  });
  return previous
    ? claimExistingMerge(tx, input, previous)
    : createMerge(tx, input);
}

export async function acquireTeamMerge(input: TeamMergeInput) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(
        (tx) => acquireInTransaction(tx, input),
        { timeout: 30_000 },
      );
    } catch (error: unknown) {
      logger.error(
        { err: error, sourceTeamId: input.sourceTeamId },
        'TEAM merge claim transaction conflicted',
      );
      if (!isPrismaUniqueConstraintError(error)) throw error;
    }
  }
  throw new BusinessError(
    'TEAM_MERGE_CONCURRENT_CLAIM',
    'TEAM merge could not claim its participants concurrently',
    409,
  );
}

export async function renewMergeLease(
  tx: Prisma.TransactionClient,
  attempt: TeamMergeAttempt,
) {
  const renewed = await tx.team_identity_merges.updateMany({
    where: {
      attemptToken: attempt.attemptToken,
      id: attempt.auditId,
      status: team_identity_merge_status.RUNNING,
    },
    data: { leaseUntil: leaseUntil() },
  });
  if (renewed.count !== 1) {
    throw new BusinessError(
      'TEAM_MERGE_LEASE_LOST',
      'TEAM merge execution lease was lost',
      409,
    );
  }
}

export async function addReferenceCounts(
  tx: Prisma.TransactionClient,
  attempt: TeamMergeAttempt,
  delta: Partial<TeamIdentityReferenceCounts>,
) {
  const merge = await tx.team_identity_merges.findUnique({
    where: { id: attempt.auditId },
    select: { referenceCounts: true },
  });
  if (!merge)
    throw new BusinessError(
      'TEAM_MERGE_NOT_FOUND',
      'TEAM merge not found',
      404,
    );
  const counts = parseReferenceCounts(merge.referenceCounts);
  for (const key of Object.keys(delta) as Array<keyof typeof counts>) {
    counts[key] += delta[key] ?? 0;
  }
  const persisted = await tx.team_identity_merges.updateMany({
    where: {
      attemptToken: attempt.attemptToken,
      id: attempt.auditId,
      status: team_identity_merge_status.RUNNING,
    },
    data: { referenceCounts: { ...counts } },
  });
  if (persisted.count !== 1) {
    throw new BusinessError(
      'TEAM_MERGE_LEASE_LOST',
      'TEAM merge lease was lost',
      409,
    );
  }
  return counts;
}

export async function markMergeAttemptFailed(
  attempt: TeamMergeAttempt,
  error: unknown,
) {
  const lastError =
    error instanceof Error
      ? error.message.slice(0, 4000)
      : String(error).slice(0, 4000);
  await prisma.team_identity_merges.updateMany({
    where: {
      attemptToken: attempt.attemptToken,
      id: attempt.auditId,
      status: team_identity_merge_status.RUNNING,
    },
    data: {
      attemptToken: null,
      failureCount: { increment: 1 },
      lastError,
      leaseUntil: null,
      status: team_identity_merge_status.FAILED,
    },
  });
}
