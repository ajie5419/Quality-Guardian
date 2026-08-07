import type { DuplicateMergePlanTeam } from './team-duplicate-merge-plan';

import process from 'node:process';

import { TeamIdentityMergeService } from '~/modules/team';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import { planConfirmedDuplicateMerges } from './team-duplicate-merge-plan';

const logger = createModuleLogger('team-duplicate-merge-runner');
const OPERATOR = 'system:team-identity-reconciliation';

interface RunOptions {
  mode: 'apply' | 'dry-run';
}

function parseOptions(args: string[]): RunOptions {
  let mode: RunOptions['mode'] = 'dry-run';
  for (const arg of args) {
    if (arg === '--apply') mode = 'apply';
    else if (arg === '--dry-run') mode = 'dry-run';
    else throw new Error(`unknown argument: ${arg}`);
  }
  return { mode };
}

async function loadPlanInput() {
  const [teams, sources, departments] = await Promise.all([
    prisma.dictionaries.findMany({
      where: { dictType: 'team', isDeleted: false },
      select: { dictKey: true, id: true, status: true },
    }),
    prisma.team_identity_sources.findMany({
      where: { isDeleted: false },
      select: { sourceId: true, sourceType: true, teamId: true },
    }),
    prisma.departments.findMany({
      where: { isDeleted: false, status: 1 },
      select: { id: true, name: true, parentId: true },
    }),
  ]);
  const sourcesByTeam = new Map<string, string[]>();
  for (const source of sources) {
    const keys = sourcesByTeam.get(source.teamId) || [];
    keys.push(`${source.sourceType}:${source.sourceId}`);
    sourcesByTeam.set(source.teamId, keys);
  }
  const planTeams: DuplicateMergePlanTeam[] = teams.map((team) => ({
    id: team.id,
    name: team.dictKey,
    sourceKeys: sourcesByTeam.get(team.id) || [],
    status: team.status,
  }));
  const parentIds = new Set(
    departments.map((department) => department.parentId),
  );
  const leaves = departments
    .filter((department) => !parentIds.has(department.id))
    .map((department) => ({ id: department.id, name: department.name }));
  return { leaves, teams: planTeams };
}

async function run() {
  try {
    const options = parseOptions(process.argv.slice(2));
    const { leaves, teams } = await loadPlanInput();
    const plans = planConfirmedDuplicateMerges(teams, leaves);
    if (plans.length === 0) {
      logger.info({ mode: options.mode }, 'no confirmed duplicate TEAM merges');
      return;
    }
    logger.info(
      { count: plans.length, mode: options.mode },
      'confirmed duplicate TEAM merges planned',
    );
    if (options.mode === 'dry-run') {
      for (const plan of plans) {
        logger.info(plan, 'would merge (dry-run)');
      }
      return;
    }
    for (const plan of plans) {
      const result = await TeamIdentityMergeService.merge(
        {
          migrateReferences: false,
          reason: plan.reason,
          sourceTeamId: plan.sourceTeamId,
          targetTeamId: plan.targetTeamId,
        },
        OPERATOR,
      );
      logger.info(
        { ...result, sourceName: plan.sourceName, targetName: plan.targetName },
        'record-only TEAM merge completed',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

void run().catch((error: unknown) => {
  logger.fatal({ err: error }, 'confirmed duplicate TEAM merge failed');
  process.exitCode = 1;
});
