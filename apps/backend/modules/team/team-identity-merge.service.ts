import type { Prisma } from '@prisma/client';

import type { TeamIdentityReferenceGroup } from './team-identity-merge-references';
import type { TeamMergeAttempt } from './team-identity-merge-state';
import type { TeamIdentityMergeInput } from './team-identity.schema';

import process from 'node:process';

import { team_identity_merge_status } from '@prisma/client';
import { BusinessError } from '~/utils/business-error';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import {
  countTeamReferences,
  migrateTeamReferenceGroup,
  TEAM_IDENTITY_REFERENCE_GROUPS,
} from './team-identity-merge-references';
import {
  acquireTeamMerge,
  addReferenceCounts,
  markMergeAttemptFailed,
  parseReferenceCounts,
  renewMergeLease,
} from './team-identity-merge-state';
import { normalizeDisplayName, normalizeOperator } from './team-identity-write';

const QUARANTINED_STATUS = 2;
const RETIRED_STATUS = 0;
const DEFAULT_BATCH_SIZE = 200;
const MAINTENANCE_MODE_ENV = 'TEAM_IDENTITY_MAINTENANCE_MODE';
const logger = createModuleLogger('TeamIdentityMergeService');

function normalizeMergeInput(input: TeamIdentityMergeInput, operator: string) {
  const sourceTeamId = normalizeDisplayName(input.sourceTeamId);
  const targetTeamId = normalizeDisplayName(input.targetTeamId);
  if (!sourceTeamId || !targetTeamId || sourceTeamId === targetTeamId) {
    throw new BusinessError(
      'INVALID_TEAM_MERGE',
      'Source and target TEAM IDs must be different',
    );
  }
  return {
    operator: normalizeOperator(operator),
    reason: normalizeDisplayName(input.reason),
    sourceTeamId,
    targetTeamId,
    migrateReferences: input.migrateReferences !== false,
  };
}

function assertMaintenanceMode() {
  if (process.env[MAINTENANCE_MODE_ENV] !== '1') {
    throw new BusinessError(
      'TEAM_MERGE_REQUIRES_MAINTENANCE',
      'TEAM merges require maintenance mode with application writes stopped',
      409,
    );
  }
}

async function migrateReferenceGroup(
  attempt: TeamMergeAttempt,
  group: TeamIdentityReferenceGroup,
) {
  while (true) {
    const delta = await prisma.$transaction(
      async (tx) => {
        await renewMergeLease(tx, attempt);
        const migrated = await migrateTeamReferenceGroup(
          tx,
          attempt,
          group,
          DEFAULT_BATCH_SIZE,
          attempt.operator,
        );
        await addReferenceCounts(tx, attempt, migrated);
        return migrated;
      },
      { timeout: 30_000 },
    );
    if (
      group === 'identityMetadata' ||
      Object.values(delta).every((count) => count === 0)
    ) {
      return;
    }
  }
}

async function loadFinalCounts(
  tx: Prisma.TransactionClient,
  attempt: TeamMergeAttempt,
) {
  const audit = await tx.team_identity_merges.findUnique({
    where: { id: attempt.auditId },
    select: { referenceCounts: true },
  });
  if (!audit) {
    throw new BusinessError(
      'TEAM_MERGE_NOT_FOUND',
      'TEAM merge not found',
      404,
    );
  }
  return parseReferenceCounts(audit.referenceCounts);
}

async function completeAudit(
  tx: Prisma.TransactionClient,
  attempt: TeamMergeAttempt,
  counts: ReturnType<typeof parseReferenceCounts>,
) {
  const completed = await tx.team_identity_merges.updateMany({
    where: {
      attemptToken: attempt.attemptToken,
      id: attempt.auditId,
      status: team_identity_merge_status.RUNNING,
    },
    data: {
      attemptToken: null,
      completedAt: new Date(),
      lastError: null,
      leaseUntil: null,
      referenceCounts: { ...counts },
      status: team_identity_merge_status.COMPLETED,
    },
  });
  if (completed.count !== 1) {
    throw new BusinessError(
      'TEAM_MERGE_LEASE_LOST',
      'TEAM merge lease was lost',
      409,
    );
  }
  await tx.team_identity_merge_participants.deleteMany({
    where: { mergeId: attempt.auditId },
  });
}

async function finalizeMerge(attempt: TeamMergeAttempt) {
  return prisma.$transaction(
    async (tx) => {
      await renewMergeLease(tx, attempt);
      if (
        attempt.migrateReferences &&
        (await countTeamReferences(tx, attempt.sourceTeamId)) !== 0
      ) {
        throw new BusinessError(
          'TEAM_MERGE_INCOMPLETE',
          'Source TEAM still has references',
          409,
        );
      }
      const retired = await tx.dictionaries.updateMany({
        where: {
          id: attempt.sourceTeamId,
          isDeleted: false,
          status: QUARANTINED_STATUS,
        },
        data: { status: RETIRED_STATUS, updatedBy: attempt.operator },
      });
      if (retired.count !== 1) {
        throw new BusinessError(
          'TEAM_MERGE_CONCURRENT_UPDATE',
          'Source TEAM merge state changed',
          409,
        );
      }
      const counts = await loadFinalCounts(tx, attempt);
      await completeAudit(tx, attempt, counts);
      return {
        auditId: attempt.auditId,
        counts,
        targetTeamId: attempt.targetTeamId,
      };
    },
    { timeout: 30_000 },
  );
}

async function recordAttemptFailure(attempt: TeamMergeAttempt, error: unknown) {
  try {
    await markMergeAttemptFailed(attempt, error);
  } catch (failureError: unknown) {
    logger.error(
      { err: failureError, auditId: attempt.auditId },
      'failed to persist TEAM merge attempt failure',
    );
  }
}

async function executeMerge(input: ReturnType<typeof normalizeMergeInput>) {
  const acquisition = await acquireTeamMerge(input);
  if (acquisition.kind === 'completed') return acquisition.result;
  const { attempt } = acquisition;
  try {
    const groups = attempt.migrateReferences
      ? TEAM_IDENTITY_REFERENCE_GROUPS
      : TEAM_IDENTITY_REFERENCE_GROUPS.filter(
          (group) => group === 'identityMetadata',
        );
    for (const group of groups) {
      await migrateReferenceGroup(attempt, group);
    }
    return await finalizeMerge(attempt);
  } catch (error: unknown) {
    logger.error(
      { err: error, auditId: attempt.auditId },
      'TEAM merge execution attempt failed',
    );
    await recordAttemptFailure(attempt, error);
    throw error;
  }
}

export const TeamIdentityMergeService = {
  async merge(input: TeamIdentityMergeInput, operator: string) {
    assertMaintenanceMode();
    const normalized = normalizeMergeInput(input, operator);
    try {
      return await executeMerge(normalized);
    } catch (error: unknown) {
      logger.error(
        { err: error, sourceTeamId: normalized.sourceTeamId },
        'TEAM identity maintenance merge failed',
      );
      throw error;
    }
  },
};
