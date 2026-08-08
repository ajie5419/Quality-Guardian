import type { BackfillOptions } from './quality-record-supplier-identity-backfill';
import type {
  TeamIdentity,
  UnresolvedRefInput,
} from './supplier-identity-backfill-runtime';

import { INCOMING_INSPECTION_PROCESS_NAME } from '@qgs/shared';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import { persistResolutionAudit } from './supplier-identity-backfill-runtime';

interface TeamIdentityContext {
  effectiveLinks?: Map<string, unknown>;
  externalTeamIds?: Set<string>;
  internalTeamIds?: Set<string>;
  teamById: Map<string, TeamIdentity>;
  teamByName: Map<string, TeamIdentity>;
}

const logger = createModuleLogger('inspection-request-team-identity-backfill');

export async function backfillInspectionRequestTeamIdentities(
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
    const rows = await prisma.qms_inspection_requests.findMany({
      where: {
        isDeleted: false,
        NOT: { processName: INCOMING_INSPECTION_PROCESS_NAME },
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: options.batchSize,
      select: {
        id: true,
        requestNo: true,
        supplierId: true,
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
      clearSupplier: boolean;
      existingSupplierId: null | string;
      existingTeamId: null | string;
      id: string;
    }> = [];
    const batchResolved: Array<{ entityId: string; resolvedId: string }> = [];
    const batchCleared: Array<{
      entityId: string;
      evidence: Record<string, null | number | string>;
      rawId: null | string;
      rawName: null | string;
      reason: string;
    }> = [];
    const batchUnresolved: UnresolvedRefInput[] = [];

    for (const row of rows) {
      const existingTeam = row.teamId
        ? context.teamById.get(row.teamId) || null
        : null;
      if (row.teamId && !existingTeam) {
        unresolved += 1;
        batchUnresolved.push({
          entityId: row.id,
          evidence: { requestNo: row.requestNo },
          rawId: row.teamId,
          rawName: row.team,
          reason: 'invalid_existing_team_id',
        });
        continue;
      }
      const nameTeam = row.team
        ? context.teamByName.get(row.team) || null
        : null;
      if (existingTeam && nameTeam && existingTeam.id !== nameTeam.id) {
        unresolved += 1;
        batchUnresolved.push({
          entityId: row.id,
          evidence: {
            existingTeamId: existingTeam.id,
            nameTeamId: nameTeam.id,
            requestNo: row.requestNo,
          },
          rawId: row.teamId,
          rawName: row.team,
          reason: 'team_identity_conflict',
        });
        continue;
      }
      const candidate = existingTeam || nameTeam;
      if (!candidate) {
        unresolved += 1;
        batchUnresolved.push({
          entityId: row.id,
          evidence: { requestNo: row.requestNo },
          rawId: row.teamId,
          rawName: row.team,
          reason: 'team_identity_not_resolved',
        });
        continue;
      }
      if (
        context.externalTeamIds?.has(candidate.id) &&
        !context.effectiveLinks?.has(candidate.id)
      ) {
        unresolved += 1;
        batchUnresolved.push({
          entityId: row.id,
          evidence: { requestNo: row.requestNo, teamId: candidate.id },
          rawId: row.teamId,
          rawName: row.team,
          reason: 'MISSING_PROCESS_TEAM_LINK',
        });
        continue;
      }
      const clearSupplier = Boolean(
        row.supplierId && context.internalTeamIds?.has(candidate.id),
      );
      if (row.teamId === candidate.id && !clearSupplier) {
        batchResolved.push({ entityId: row.id, resolvedId: candidate.id });
        continue;
      }
      batchUpdates.push({
        candidate,
        clearSupplier,
        existingTeamId: row.teamId,
        existingSupplierId: row.supplierId,
        id: row.id,
      });
    }

    if (options.mode === 'apply') {
      const applied = await prisma.$transaction(async (tx) => {
        const results = await Promise.all(
          batchUpdates.map((item) =>
            tx.qms_inspection_requests.updateMany({
              where: {
                id: item.id,
                isDeleted: false,
                teamId: item.existingTeamId,
                ...(item.clearSupplier
                  ? { supplierId: item.existingSupplierId }
                  : {}),
              },
              data: {
                teamId: item.candidate.id,
                ...(item.clearSupplier ? { supplierId: null } : {}),
              },
            }),
          ),
        );
        results.forEach((result, index) => {
          const update = batchUpdates[index];
          if (result.count > 0 && update) {
            batchResolved.push({
              entityId: update.id,
              resolvedId: update.candidate.id,
            });
            if (update.clearSupplier) {
              batchCleared.push({
                entityId: update.id,
                evidence: { teamId: update.candidate.id },
                rawId: update.existingSupplierId,
                rawName: null,
                reason: 'internal_team_supplier_fields_cleared',
              });
            }
          }
        });
        await persistResolutionAudit(
          {
            entityType: 'qms_inspection_requests',
            fieldName: 'teamId',
            resolved: batchResolved,
            unresolved: batchUnresolved,
          },
          tx,
        );
        await persistResolutionAudit(
          {
            cleared: batchCleared,
            entityType: 'qms_inspection_requests',
            fieldName: 'supplierId',
            resolved: [],
            unresolved: [],
          },
          tx,
        );
        return results.reduce((sum, result) => sum + result.count, 0);
      });
      updated += applied;
      concurrentChanges += batchUpdates.length - applied;
    } else {
      updated += batchUpdates.length;
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
  logger.info(summary, 'inspection request TEAM identity backfill finished');
  return summary;
}
