import type { Prisma } from '@prisma/client';

import prisma from '~/utils/prisma';

function normalizeId(value: unknown) {
  return String(value || '').trim();
}

export type TeamSupplierIdentity = { id: string; name: string };

export const teamLinkInclude = {
  supplier: { select: { id: true, isDeleted: true, name: true } },
} satisfies Prisma.supplier_identity_linksInclude;

// Legacy TEAMs may predate supplier identity links. Match the TEAM name
// against the supplier master (preferring Outsourcing units) so 厂内外包队
// are still recognized as external without an explicit link.
export async function resolveSuppliersByExactTeamNames(
  names: ReadonlyArray<string>,
  client: Pick<Prisma.TransactionClient, 'suppliers'> = prisma,
) {
  const uniqueNames = [
    ...new Set(names.map((name) => normalizeId(name)).filter(Boolean)),
  ];
  if (uniqueNames.length === 0) {
    return new Map<string, TeamSupplierIdentity>();
  }
  const suppliers = await client.suppliers.findMany({
    orderBy: { createdAt: 'asc' },
    select: { category: true, id: true, name: true },
    where: { isDeleted: false, name: { in: uniqueNames } },
  });
  const bestByName = new Map<
    string,
    { category: string; id: string; name: string }
  >();
  for (const supplier of suppliers) {
    const key = normalizeId(supplier.name);
    const current = bestByName.get(key);
    if (
      !current ||
      (supplier.category === 'Outsourcing' &&
        current.category !== 'Outsourcing')
    ) {
      bestByName.set(key, {
        category: supplier.category,
        id: supplier.id,
        name: supplier.name,
      });
    }
  }
  return new Map(
    [...bestByName].map(([name, best]) => [
      name,
      { id: best.id, name: best.name },
    ]),
  );
}

export async function resolveTeamSupplierByTeamName(
  client: Pick<Prisma.TransactionClient, 'dictionaries' | 'suppliers'>,
  teamId: string,
) {
  const team = await client.dictionaries.findFirst({
    select: { dictKey: true },
    where: { dictType: 'team', id: teamId, isDeleted: false, status: 1 },
  });
  if (!team) return null;
  const matched = await resolveSuppliersByExactTeamNames(
    [team.dictKey],
    client,
  );
  return matched.get(normalizeId(team.dictKey)) || null;
}

export async function resolveTeamSupplierIdentity(
  teamId: string,
  client: Pick<
    Prisma.TransactionClient,
    'dictionaries' | 'supplier_identity_links' | 'suppliers'
  > = prisma,
) {
  const link = await client.supplier_identity_links.findFirst({
    where: {
      identityId: teamId,
      identityType: 'TEAM',
      isDeleted: false,
      supplier: { is: { isDeleted: false } },
    },
    include: teamLinkInclude,
  });
  if (link && !link.supplier.isDeleted) {
    return { id: link.supplier.id, name: link.supplier.name };
  }
  return resolveTeamSupplierByTeamName(client, teamId);
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
  const links = await prisma.supplier_identity_links.findMany({
    where: {
      identityId: { in: ids },
      identityType: 'TEAM',
      isDeleted: false,
      supplier: { is: { isDeleted: false } },
    },
    include: teamLinkInclude,
  });
  const result = new Map<string, TeamSupplierIdentity>();
  for (const link of links) {
    if (link.supplier.isDeleted) continue;
    result.set(link.identityId, {
      id: link.supplier.id,
      name: link.supplier.name,
    });
  }
  const unlinkedSuppliers = await resolveSuppliersByUnlinkedTeamIds(
    ids.filter((teamId) => !result.has(teamId)),
  );
  for (const [teamId, supplier] of unlinkedSuppliers) {
    result.set(teamId, supplier);
  }
  return result;
}

export async function resolveSuppliersByUnlinkedTeamIds(
  teamIds: ReadonlyArray<string>,
) {
  const ids = [
    ...new Set(teamIds.map((id) => normalizeId(id)).filter(Boolean)),
  ];
  if (ids.length === 0) {
    return new Map<string, TeamSupplierIdentity>();
  }
  const teams = await prisma.dictionaries.findMany({
    select: { dictKey: true, id: true },
    where: {
      dictType: 'team',
      id: { in: ids },
      isDeleted: false,
      status: 1,
    },
  });
  const suppliersByName = await resolveSuppliersByExactTeamNames(
    teams.map((team) => team.dictKey),
  );
  const result = new Map<string, TeamSupplierIdentity>();
  for (const team of teams) {
    const matched = suppliersByName.get(normalizeId(team.dictKey));
    if (matched) result.set(team.id, matched);
  }
  return result;
}
