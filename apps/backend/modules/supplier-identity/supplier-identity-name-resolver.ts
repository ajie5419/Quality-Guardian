import type { Prisma } from '@prisma/client';

import { resolveSupplierInspectionPolicy } from '@qgs/shared';
import prisma from '~/utils/prisma';

function normalizeId(value: unknown) {
  return String(value || '').trim();
}

export type TeamSupplierIdentity = { id: string; name: string };

export const teamLinkInclude = {
  supplier: {
    select: {
      category: true,
      id: true,
      isDeleted: true,
      name: true,
      outsourcingMode: true,
    },
  },
} satisfies Prisma.supplier_identity_linksInclude;

type TeamLinkResolverClient = Pick<
  Prisma.TransactionClient,
  'dictionaries' | 'supplier_identity_links' | 'team_identity_sources'
>;

function isEligibleTeamSupplier(link: {
  supplier: {
    category: null | string;
    isDeleted: boolean;
    outsourcingMode: null | string;
  };
}) {
  return (
    !link.supplier.isDeleted &&
    resolveSupplierInspectionPolicy(link.supplier).identitySource === 'team'
  );
}

export async function resolveTeamSupplierIdentity(
  teamId: string,
  client: TeamLinkResolverClient = prisma,
) {
  const team = await client.dictionaries.findFirst({
    select: { id: true },
    where: {
      dictType: 'team',
      id: teamId,
      isDeleted: false,
      status: 1,
    },
  });
  if (!team) return null;
  const link = await client.supplier_identity_links.findFirst({
    where: {
      identityId: teamId,
      identityType: 'TEAM',
      isDeleted: false,
      supplier: { is: { isDeleted: false } },
    },
    include: teamLinkInclude,
  });
  if (!link || !isEligibleTeamSupplier(link)) return null;
  const source = await client.team_identity_sources.findFirst({
    select: { id: true },
    where: {
      isDeleted: false,
      sourceId: link.supplier.id,
      sourceType: 'SUPPLIER',
      teamId,
      team: {
        is: {
          teamIdentitySources: {
            none: { isDeleted: false, sourceType: 'DEPARTMENT' },
          },
        },
      },
    },
  });
  if (source) {
    return { id: link.supplier.id, name: link.supplier.name };
  }
  return null;
}

export async function resolveSuppliersByTeamIds(
  teamIds: ReadonlyArray<null | string | undefined>,
) {
  const ids = [
    ...new Set(teamIds.map((id) => normalizeId(id)).filter(Boolean)),
  ];
  if (ids.length === 0) {
    return new Map<string, TeamSupplierIdentity>();
  }
  const teams = await prisma.dictionaries.findMany({
    select: { id: true },
    where: {
      dictType: 'team',
      id: { in: ids },
      isDeleted: false,
      status: 1,
    },
  });
  const activeTeamIds = teams.map((team) => team.id);
  if (activeTeamIds.length === 0) {
    return new Map<string, TeamSupplierIdentity>();
  }
  const links = await prisma.supplier_identity_links.findMany({
    where: {
      identityId: { in: activeTeamIds },
      identityType: 'TEAM',
      isDeleted: false,
      supplier: { is: { isDeleted: false } },
    },
    include: teamLinkInclude,
  });
  const eligibleLinks = links.filter((link) => isEligibleTeamSupplier(link));
  if (eligibleLinks.length === 0) {
    return new Map<string, TeamSupplierIdentity>();
  }
  const sources = await prisma.team_identity_sources.findMany({
    where: {
      isDeleted: false,
      sourceId: {
        in: [...new Set(eligibleLinks.map((link) => link.supplierId))],
      },
      sourceType: 'SUPPLIER',
      teamId: { in: activeTeamIds },
      team: {
        is: {
          teamIdentitySources: {
            none: { isDeleted: false, sourceType: 'DEPARTMENT' },
          },
        },
      },
    },
    select: { sourceId: true, teamId: true },
  });
  const sourcePairs = new Set(
    sources.map((source) => `${source.teamId}:${source.sourceId}`),
  );
  const result = new Map<string, TeamSupplierIdentity>();
  for (const link of eligibleLinks) {
    if (!sourcePairs.has(`${link.identityId}:${link.supplierId}`)) continue;
    result.set(link.identityId, {
      id: link.supplier.id,
      name: link.supplier.name,
    });
  }
  return result;
}
