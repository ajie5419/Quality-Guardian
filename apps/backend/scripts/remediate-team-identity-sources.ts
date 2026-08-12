import process from 'node:process';

import { resolveSupplierInspectionPolicy } from '@qgs/shared';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

const logger = createModuleLogger('team-identity-source-remediation');

type Mode = 'apply' | 'dry-run';

function parseOptions(args: string[]): { mode: Mode } {
  const mode: Mode = args.includes('--apply') ? 'apply' : 'dry-run';
  return { mode };
}

/**
 * Completes the identity metadata for confirmed TEAM mappings:
 * - A TEAM with a single valid explicit supplier link must carry the matching
 *   SUPPLIER source row; legacy link-only rows are missing that source.
 * - A TEAM with no link/source whose name exactly matches one active
 *   department is an internal BU and gets the DEPARTMENT source.
 * Nothing is derived from ambiguous names; unresolved cases are left audited.
 */
export async function remediateTeamIdentitySources(options: { mode: Mode }) {
  const [links, sources, teams, departments] = await Promise.all([
    prisma.supplier_identity_links.findMany({
      where: { identityType: 'TEAM' },
      include: {
        supplier: {
          select: {
            category: true,
            id: true,
            isDeleted: true,
            name: true,
            outsourcingMode: true,
          },
        },
      },
    }),
    prisma.team_identity_sources.findMany({
      where: { isDeleted: false },
      select: { sourceId: true, sourceType: true, teamId: true },
    }),
    prisma.dictionaries.findMany({
      where: { dictType: 'team', isDeleted: false, status: 1 },
      select: { dictKey: true, id: true },
    }),
    prisma.departments.findMany({
      where: { isDeleted: false, status: 1 },
      select: { id: true, name: true },
    }),
  ]);

  const sourceByTeam = new Map<
    string,
    Array<{ sourceId: string; sourceType: string }>
  >();
  for (const source of sources) {
    const list = sourceByTeam.get(source.teamId) || [];
    list.push(source);
    sourceByTeam.set(source.teamId, list);
  }
  const departmentByName = new Map<string, string[]>();
  for (const department of departments) {
    const list = departmentByName.get(department.name) || [];
    list.push(department.id);
    departmentByName.set(department.name, list);
  }
  const teamNameById = new Map(teams.map((team) => [team.id, team.dictKey]));

  const plannedSupplierSources: Array<{ sourceId: string; teamId: string }> =
    [];
  const plannedDepartmentSources: Array<{ sourceId: string; teamId: string }> =
    [];
  let conflicts = 0;
  let skipped = 0;
  const revived: Array<{
    sourceId: string;
    sourceType: string;
    teamId: string;
  }> = [];

  for (const link of links) {
    if (link.isDeleted) continue;
    if (
      link.supplier.isDeleted ||
      resolveSupplierInspectionPolicy(link.supplier).identitySource !== 'team'
    ) {
      skipped += 1;
      continue;
    }
    const teamSources = sourceByTeam.get(link.identityId) || [];
    if (teamSources.some((source) => source.sourceType === 'DEPARTMENT')) {
      conflicts += 1;
      continue;
    }
    const supplierSources = teamSources.filter(
      (source) => source.sourceType === 'SUPPLIER',
    );
    if (supplierSources.some((source) => source.sourceId === link.supplierId)) {
      continue;
    }
    if (supplierSources.length > 0) {
      conflicts += 1;
      continue;
    }
    plannedSupplierSources.push({
      sourceId: link.supplierId,
      teamId: link.identityId,
    });
  }

  for (const team of teams) {
    const teamSources = sourceByTeam.get(team.id) || [];
    if (teamSources.length > 0) continue;
    const hasLink = links.some(
      (link) => link.identityId === team.id && !link.isDeleted,
    );
    if (hasLink) continue;
    const departmentIds = departmentByName.get(team.dictKey) || [];
    if (departmentIds.length !== 1) continue;
    plannedDepartmentSources.push({
      sourceId: departmentIds[0],
      teamId: team.id,
    });
  }

  if (options.mode === 'apply') {
    const planned = [
      ...plannedSupplierSources.map((item) => ({
        ...item,
        sourceType: 'SUPPLIER' as const,
      })),
      ...plannedDepartmentSources.map((item) => ({
        ...item,
        sourceType: 'DEPARTMENT' as const,
      })),
    ];
    await prisma.$transaction(async (tx) => {
      for (const item of planned) {
        // (sourceType, sourceId) is globally unique, so a soft-deleted row for
        // the same source must be revived instead of created.
        const revivedCount = await tx.team_identity_sources.updateMany({
          where: {
            isDeleted: true,
            sourceId: item.sourceId,
            sourceType: item.sourceType,
          },
          data: { isDeleted: false, teamId: item.teamId },
        });
        if (revivedCount.count === 1) {
          revived.push(item);
          continue;
        }
        const existing = await tx.team_identity_sources.findFirst({
          where: { sourceId: item.sourceId, sourceType: item.sourceType },
          select: { isDeleted: true, teamId: true },
        });
        if (existing && existing.teamId !== item.teamId) {
          conflicts += 1;
          continue;
        }
        await tx.team_identity_sources.create({
          data: {
            sourceId: item.sourceId,
            sourceType: item.sourceType,
            teamId: item.teamId,
          },
        });
      }
    });
  }

  const summary = {
    conflicts,
    departmentSources: plannedDepartmentSources.map((item) => ({
      sourceId: item.sourceId,
      teamId: item.teamId,
      teamName: teamNameById.get(item.teamId) || null,
    })),
    mode: options.mode,
    revived: revived.map((item) => ({
      sourceId: item.sourceId,
      sourceType: item.sourceType,
      teamId: item.teamId,
      teamName: teamNameById.get(item.teamId) || null,
    })),
    skipped,
    supplierSources: plannedSupplierSources.map((item) => ({
      sourceId: item.sourceId,
      teamId: item.teamId,
      teamName: teamNameById.get(item.teamId) || null,
    })),
  };
  logger.info(summary, 'TEAM identity source remediation finished');
  return summary;
}

async function run() {
  const options = parseOptions(process.argv.slice(2));
  try {
    await remediateTeamIdentitySources(options);
  } finally {
    await prisma.$disconnect();
  }
}

void run().catch((error: unknown) => {
  logger.fatal({ err: error }, 'TEAM identity source remediation failed');
  process.exitCode = 1;
});
