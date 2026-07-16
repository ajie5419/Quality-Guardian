import type { BackfillOptions } from './quality-record-supplier-identity-backfill';
import type {
  TeamIdentity,
  UnresolvedRefInput,
} from './supplier-identity-backfill-runtime';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import { persistResolutionAudit } from './supplier-identity-backfill-runtime';

interface TeamIdentityContext {
  teamById: Map<string, TeamIdentity>;
  teamByName: Map<string, TeamIdentity>;
}

const logger = createModuleLogger('inspection-team-identity-backfill');

export async function backfillInspectionTeamIdentities(
  options: BackfillOptions,
  context: TeamIdentityContext,
) {
  let batches = 0;
  let concurrentChanges = 0;
  let cursorId: string | undefined;
  let processed = 0;
  let unresolved = 0;
  let updated = 0;

  while (!options.maxBatches || batches < options.maxBatches) {
    const rows = await prisma.inspections.findMany({
      where: {
        category: 'PROCESS',
        isDeleted: false,
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: options.batchSize,
      select: {
        id: true,
        serialNumber: true,
        team: true,
        teamId: true,
      },
    });
    if (rows.length === 0) break;

    batches += 1;
    processed += rows.length;
    cursorId = rows.at(-1)?.id;
    const batchUpdates: Array<{
      candidate: TeamIdentity;
      existingTeamId: null | string;
      id: string;
    }> = [];
    const batchResolved: Array<{ entityId: string; resolvedId: string }> = [];
    const batchUnresolved: UnresolvedRefInput[] = [];

    for (const row of rows) {
      const existingTeam = row.teamId
        ? context.teamById.get(row.teamId) || null
        : null;
      const nameTeam = row.team
        ? context.teamByName.get(row.team) || null
        : null;
      let reason: null | string = null;
      if (row.teamId && !existingTeam) {
        reason = 'invalid_existing_team_id';
      } else if (existingTeam && nameTeam && existingTeam.id !== nameTeam.id) {
        reason = 'team_identity_conflict';
      } else if (!existingTeam && !nameTeam) {
        reason = 'team_identity_not_resolved';
      }
      if (reason) {
        unresolved += 1;
        batchUnresolved.push({
          entityId: row.id,
          evidence: { serialNumber: row.serialNumber },
          rawId: row.teamId,
          rawName: row.team,
          reason,
        });
        continue;
      }

      const candidate = existingTeam || nameTeam;
      if (!candidate) continue;
      if (row.teamId === candidate.id && row.team === candidate.name) {
        batchResolved.push({ entityId: row.id, resolvedId: candidate.id });
        continue;
      }
      batchUpdates.push({
        candidate,
        existingTeamId: row.teamId,
        id: row.id,
      });
    }

    if (options.mode === 'apply' && batchUpdates.length > 0) {
      const results = await prisma.$transaction(
        batchUpdates.map((item) =>
          prisma.inspections.updateMany({
            where: {
              id: item.id,
              isDeleted: false,
              teamId: item.existingTeamId,
            },
            data: {
              team: item.candidate.name,
              teamId: item.candidate.id,
            },
          }),
        ),
      );
      const applied = results.reduce((sum, result) => sum + result.count, 0);
      results.forEach((result, index) => {
        const update = batchUpdates[index];
        if (result.count > 0 && update) {
          batchResolved.push({
            entityId: update.id,
            resolvedId: update.candidate.id,
          });
        }
      });
      updated += applied;
      concurrentChanges += batchUpdates.length - applied;
    } else {
      updated += batchUpdates.length;
    }
    if (options.mode === 'apply') {
      await persistResolutionAudit({
        entityType: 'inspections',
        fieldName: 'teamId',
        resolved: batchResolved,
        unresolved: batchUnresolved,
      });
    }
  }

  const summary = {
    batches,
    concurrentChanges,
    mode: options.mode,
    processed,
    unresolved,
    updated,
  };
  logger.info(summary, 'inspection TEAM identity backfill finished');
  return summary;
}
