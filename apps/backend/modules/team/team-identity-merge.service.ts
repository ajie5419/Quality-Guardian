import type { Prisma } from '@prisma/client';

import type { TeamIdentityMergeInput } from './team-identity.schema';

import process from 'node:process';

import { team_identity_merge_status } from '@prisma/client';
import { BusinessError } from '~/utils/business-error';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import {
  countTeamReferences,
  createEmptyReferenceCounts,
  migrateTeamReferences,
} from './team-identity-merge-references';
import { normalizeDisplayName, normalizeOperator } from './team-identity-write';

const TEAM_DICT_TYPE = 'team';
const ACTIVE_STATUS = 1;
const RETIRED_STATUS = 0;
const DEFAULT_BATCH_SIZE = 200;
const MAINTENANCE_MODE_ENV = 'TEAM_IDENTITY_MAINTENANCE_MODE';
const logger = createModuleLogger('TeamIdentityMergeService');

function parseReferenceCounts(value: null | Prisma.JsonValue) {
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

async function loadMergeTeams(
  tx: Prisma.TransactionClient,
  sourceTeamId: string,
  targetTeamId: string,
) {
  const teams = await tx.dictionaries.findMany({
    where: {
      id: { in: [sourceTeamId, targetTeamId] },
      dictType: TEAM_DICT_TYPE,
      isDeleted: false,
    },
    select: { dictKey: true, id: true, isSystem: true, status: true },
  });
  const source = teams.find((team) => team.id === sourceTeamId);
  const target = teams.find((team) => team.id === targetTeamId);
  if (!source || source.status !== ACTIVE_STATUS) {
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

async function assertNoMergeParticipantConflict(
  tx: Prisma.TransactionClient,
  sourceTeamId: string,
  targetTeamId: string,
) {
  const conflict = await tx.team_identity_merges.findFirst({
    where: {
      isDeleted: false,
      status: team_identity_merge_status.PENDING,
      OR: [
        { sourceTeamId: { in: [sourceTeamId, targetTeamId] } },
        { targetTeamId: { in: [sourceTeamId, targetTeamId] } },
      ],
    },
    select: { id: true },
  });
  if (conflict) {
    throw new BusinessError(
      'TEAM_MERGE_PARTICIPANT_CONFLICT',
      'A TEAM identity is already part of another pending merge',
      409,
    );
  }
}

async function lockMergeParticipants(
  tx: Prisma.TransactionClient,
  teamIds: string[],
) {
  for (const teamId of [...new Set(teamIds)].sort()) {
    await tx.$queryRaw`
      SELECT id
      FROM dictionaries
      WHERE id = ${teamId} AND dictType = 'team'
      FOR UPDATE
    `;
  }
}

async function assertSupplierLinksCompatible(
  tx: Prisma.TransactionClient,
  sourceTeamId: string,
  targetTeamId: string,
) {
  const links = await tx.supplier_identity_links.findMany({
    where: {
      identityId: { in: [sourceTeamId, targetTeamId] },
      identityType: 'TEAM',
      isDeleted: false,
    },
    select: { identityId: true, supplierId: true },
  });
  const source = links.find((link) => link.identityId === sourceTeamId);
  const target = links.find((link) => link.identityId === targetTeamId);
  if (source && target && source.supplierId !== target.supplierId) {
    throw new BusinessError(
      'TEAM_MERGE_SUPPLIER_CONFLICT',
      'Source and target TEAM identities belong to different suppliers',
      409,
    );
  }
}

function completedMerge(previous: {
  id: string;
  referenceCounts: null | Prisma.JsonValue;
  targetTeamId: string;
}) {
  return {
    auditId: previous.id,
    counts: parseReferenceCounts(previous.referenceCounts),
    targetTeamId: previous.targetTeamId,
  };
}

async function executeMerge(input: ReturnType<typeof normalizeMergeInput>) {
  return prisma.$transaction(
    async (tx) => {
      const idempotencyKey = `team-merge:${input.sourceTeamId}`;
      const previous = await tx.team_identity_merges.findUnique({
        where: { idempotencyKey },
      });
      if (previous) {
        if (previous.targetTeamId !== input.targetTeamId) {
          throw new BusinessError(
            'TEAM_ALREADY_MERGED',
            'Source TEAM already has a different merge target',
            409,
          );
        }
        if (previous.status === team_identity_merge_status.COMPLETED) {
          return completedMerge(previous);
        }
        throw new BusinessError(
          'TEAM_MERGE_PENDING',
          'Source TEAM already has an incomplete merge audit',
          409,
        );
      }
      await lockMergeParticipants(tx, [input.sourceTeamId, input.targetTeamId]);
      await assertNoMergeParticipantConflict(
        tx,
        input.sourceTeamId,
        input.targetTeamId,
      );
      const { source, target } = await loadMergeTeams(
        tx,
        input.sourceTeamId,
        input.targetTeamId,
      );
      await assertSupplierLinksCompatible(tx, source.id, target.id);
      const audit = await tx.team_identity_merges.create({
        data: {
          idempotencyKey,
          operator: input.operator,
          reason: input.reason,
          sourceNameSnapshot: source.dictKey,
          sourceTeamId: source.id,
          targetNameSnapshot: target.dictKey,
          targetTeamId: target.id,
        },
      });
      const quarantined = await tx.dictionaries.updateMany({
        where: {
          id: source.id,
          isDeleted: false,
          status: ACTIVE_STATUS,
        },
        data: { status: 2, updatedBy: input.operator },
      });
      if (quarantined.count !== 1) {
        throw new BusinessError(
          'TEAM_MERGE_CONCURRENT_UPDATE',
          'Source TEAM merge state changed',
          409,
        );
      }
      const merge = {
        auditId: audit.id,
        sourceName: source.dictKey,
        sourceTeamId: source.id,
        targetName: target.dictKey,
        targetTeamId: target.id,
      };
      const counts = await migrateTeamReferences(
        tx,
        merge,
        DEFAULT_BATCH_SIZE,
        input.operator,
      );
      if ((await countTeamReferences(tx, source.id)) !== 0) {
        throw new BusinessError(
          'TEAM_MERGE_INCOMPLETE',
          'Source TEAM still has references',
          409,
        );
      }
      await tx.dictionaries.update({
        where: { id: source.id },
        data: { status: RETIRED_STATUS, updatedBy: input.operator },
      });
      await tx.team_identity_merges.update({
        where: { id: audit.id },
        data: {
          completedAt: new Date(),
          referenceCounts: { ...counts },
          status: team_identity_merge_status.COMPLETED,
        },
      });
      return { auditId: audit.id, counts, targetTeamId: target.id };
    },
    { timeout: 120_000 },
  );
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
