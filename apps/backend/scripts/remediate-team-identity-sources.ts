import type { Prisma } from '@prisma/client';

import process from 'node:process';

import { resolveSupplierInspectionPolicy } from '@qgs/shared';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

const logger = createModuleLogger('team-identity-source-remediation');

type Mode = 'apply' | 'dry-run';

function parseOptions(args: string[]): { mode: Mode } {
  return { mode: args.includes('--apply') ? 'apply' : 'dry-run' };
}

/**
 * Confirmed TEAM -> supplier mappings reviewed by the business owner. The
 * team name exactly equals the supplier master name and the supplier is a
 * PROCESS-policy TEAM identity source.
 */
const CONFIRMED_TEAM_SUPPLIER_LINKS: Array<{
  supplierId: string;
  teamId: string;
  teamName: string;
}> = [
  {
    supplierId: 'SUP-1769076104551-s4sh',
    teamId: '0e9b4248568311f1881c00163e37355f',
    teamName: '卢龙县强盛科技有限公司',
  },
  {
    supplierId: 'SUP-2026--XAOX2',
    teamId: '0e9b42b9568311f1881c00163e37355f',
    teamName: '秦皇岛秦开文旅发展集团有限公司龙海道分公司',
  },
  {
    supplierId: 'SUP-1769076104249-hbq4',
    teamId: '0e9b42f3568311f1881c00163e37355f',
    teamName: '秦皇岛旭哲金属加工有限公司',
  },
  {
    supplierId: 'SUP-1769076104529-s2x5',
    teamId: '0e9b4221568311f1881c00163e37355f',
    teamName: '秦皇岛弘旺设备安装工程有限公司',
  },
];

/**
 * Confirmed supplier master-data corrections: these Outsourcing suppliers are
 * in-house/on-site teams but their outsourcing mode was never set, which made
 * them ineligible as TEAM identity sources.
 */
const CONFIRMED_SUPPLIER_OUTSOURCING_MODE_FIXES: Array<{
  outsourcingMode: 'IN_HOUSE_TEAM';
  supplierId: string;
}> = [
  { outsourcingMode: 'IN_HOUSE_TEAM', supplierId: 'SUP-1769076104551-s4sh' },
  { outsourcingMode: 'IN_HOUSE_TEAM', supplierId: 'SUP-2026--XAOX2' },
  { outsourcingMode: 'IN_HOUSE_TEAM', supplierId: 'SUP-1769076104249-hbq4' },
  { outsourcingMode: 'IN_HOUSE_TEAM', supplierId: 'SUP-1769076104529-s2x5' },
];

type SourcePlan = {
  sourceId: string;
  sourceType: 'DEPARTMENT' | 'SUPPLIER';
  teamId: string;
};

async function ensureSource(
  tx: Prisma.TransactionClient,
  item: SourcePlan,
  revived: SourcePlan[],
  conflicts: { value: number },
) {
  // (sourceType, sourceId) is globally unique, so a soft-deleted row for the
  // same source must be revived instead of created.
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
    return;
  }
  const existing = await tx.team_identity_sources.findFirst({
    where: { sourceId: item.sourceId, sourceType: item.sourceType },
    select: { isDeleted: true, teamId: true },
  });
  if (existing && existing.teamId !== item.teamId) {
    conflicts.value += 1;
    return;
  }
  await tx.team_identity_sources.create({
    data: {
      sourceId: item.sourceId,
      sourceType: item.sourceType,
      teamId: item.teamId,
    },
  });
}

async function ensureLink(
  tx: Prisma.TransactionClient,
  input: { supplierId: string; teamId: string; teamName: string },
) {
  const updated = await tx.supplier_identity_links.updateMany({
    where: {
      identityId: input.teamId,
      identityType: 'TEAM',
      isDeleted: false,
      supplierId: { not: input.supplierId },
    },
    data: {
      identityNameSnapshot: input.teamName,
      supplierId: input.supplierId,
    },
  });
  if (updated.count > 0) return;
  const restored = await tx.supplier_identity_links.updateMany({
    where: {
      identityId: input.teamId,
      identityType: 'TEAM',
      isDeleted: true,
    },
    data: {
      identityNameSnapshot: input.teamName,
      isDeleted: false,
      supplierId: input.supplierId,
    },
  });
  if (restored.count > 0) return;
  const existing = await tx.supplier_identity_links.findFirst({
    where: { identityId: input.teamId, identityType: 'TEAM' },
    select: { supplierId: true },
  });
  if (existing && existing.supplierId === input.supplierId) return;
  await tx.supplier_identity_links.create({
    data: {
      identityId: input.teamId,
      identityNameSnapshot: input.teamName,
      identityType: 'TEAM',
      supplierId: input.supplierId,
    },
  });
}

/**
 * Completes the identity metadata for confirmed TEAM mappings:
 * - Confirmed external TEAMs get their TEAM -> supplier link and SUPPLIER
 *   source row (repairing wrong or soft-deleted rows).
 * - A TEAM with a valid explicit link must carry the matching SUPPLIER source;
 *   legacy link-only rows are missing that source.
 * - A TEAM with no link/source whose name exactly matches one active
 *   department is an internal BU and gets the DEPARTMENT source.
 * Nothing is derived from ambiguous names; unresolved cases are left audited.
 */
export async function remediateTeamIdentitySources(options: { mode: Mode }) {
  const [links, sources, teams, departments, suppliers] = await Promise.all([
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
    prisma.suppliers.findMany({
      where: { isDeleted: false },
      select: {
        category: true,
        id: true,
        outsourcingMode: true,
      },
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
  const supplierById = new Map(
    suppliers.map((supplier) => [supplier.id, supplier]),
  );

  const plannedSupplierSources: Array<{ sourceId: string; teamId: string }> =
    [];
  const plannedDepartmentSources: Array<{ sourceId: string; teamId: string }> =
    [];
  const plannedLinks: Array<{
    supplierId: string;
    teamId: string;
    teamName: string;
  }> = [];
  const skippedReasons: string[] = [];
  let conflicts = 0;
  let skipped = 0;
  const revived: SourcePlan[] = [];
  const qualityRecordsAligned: Array<{
    supplierId: string;
    teamId: string;
    teamName: string;
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
    for (const fix of CONFIRMED_SUPPLIER_OUTSOURCING_MODE_FIXES) {
      await prisma.suppliers.updateMany({
        where: {
          id: fix.supplierId,
          isDeleted: false,
          outsourcingMode: null,
        },
        data: { outsourcingMode: fix.outsourcingMode },
      });
    }
    for (const confirmed of CONFIRMED_TEAM_SUPPLIER_LINKS) {
      const team = await prisma.dictionaries.findFirst({
        where: {
          dictType: 'team',
          id: confirmed.teamId,
          isDeleted: false,
          status: 1,
        },
        select: { dictKey: true },
      });
      if (!team) {
        skippedReasons.push(`${confirmed.teamName}:teamNotFound`);
        continue;
      }
      const supplier = await prisma.suppliers.findFirst({
        where: { id: confirmed.supplierId, isDeleted: false },
        select: { category: true, outsourcingMode: true },
      });
      if (!supplier) {
        skippedReasons.push(`${confirmed.teamName}:supplierNotFound`);
        continue;
      }
      if (resolveSupplierInspectionPolicy(supplier).identitySource !== 'team') {
        skippedReasons.push(
          `${confirmed.teamName}:supplierNotProcessPolicy(category=${supplier.category},mode=${String(supplier.outsourcingMode)})`,
        );
        continue;
      }
      const teamSources = await prisma.team_identity_sources.findMany({
        where: { teamId: confirmed.teamId, isDeleted: false },
        select: { sourceId: true, sourceType: true },
      });
      if (teamSources.some((source) => source.sourceType === 'DEPARTMENT')) {
        conflicts += 1;
        continue;
      }
      plannedLinks.push(confirmed);
    }
  } else {
    // Dry-run: keep the deterministic preloaded-map checks for reporting.
    for (const confirmed of CONFIRMED_TEAM_SUPPLIER_LINKS) {
      if (!teamNameById.has(confirmed.teamId)) continue;
      const supplier = supplierById.get(confirmed.supplierId);
      if (!supplier) continue;
      if (resolveSupplierInspectionPolicy(supplier).identitySource !== 'team') {
        continue;
      }
      const teamSources = sourceByTeam.get(confirmed.teamId) || [];
      if (teamSources.some((source) => source.sourceType === 'DEPARTMENT')) {
        continue;
      }
      plannedLinks.push(confirmed);
    }
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
    const conflictCounter = { value: 0 };
    await prisma.$transaction(async (tx) => {
      for (const item of planned) {
        await ensureSource(tx, item, revived, conflictCounter);
      }
      for (const item of plannedLinks) {
        await ensureLink(tx, item);
        await ensureSource(
          tx,
          {
            sourceId: item.supplierId,
            sourceType: 'SUPPLIER',
            teamId: item.teamId,
          },
          revived,
          conflictCounter,
        );
      }
      // Confirmed external TEAMs are the canonical identity source for their
      // inspection records: align linked quality records to the confirmed
      // supplier so a stale record snapshot cannot conflict with the TEAM.
      for (const item of CONFIRMED_TEAM_SUPPLIER_LINKS) {
        const updated = await tx.quality_records.updateMany({
          where: {
            isDeleted: false,
            inspection: { isDeleted: false, teamId: item.teamId },
            NOT: { supplierId: item.supplierId },
          },
          data: { supplierId: item.supplierId, supplierName: item.teamName },
        });
        if (updated.count > 0) {
          qualityRecordsAligned.push(item);
        }
      }
    });
    conflicts += conflictCounter.value;
  }

  const summary = {
    conflicts,
    departmentSources: plannedDepartmentSources.map((item) => ({
      sourceId: item.sourceId,
      teamId: item.teamId,
      teamName: teamNameById.get(item.teamId) || null,
    })),
    links: plannedLinks.map((item) => ({
      supplierId: item.supplierId,
      teamId: item.teamId,
      teamName: item.teamName,
    })),
    mode: options.mode,
    qualityRecordsAligned,
    revived: revived.map((item) => ({
      sourceId: item.sourceId,
      sourceType: item.sourceType,
      teamId: item.teamId,
      teamName: teamNameById.get(item.teamId) || null,
    })),
    skipped,
    skippedReasons,
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
