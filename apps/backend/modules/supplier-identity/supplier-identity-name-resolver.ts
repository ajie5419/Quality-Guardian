import type { Prisma } from '@prisma/client';

import prisma from '~/utils/prisma';

function normalizeId(value: unknown) {
  return String(value || '').trim();
}

export type TeamSupplierIdentity = { id: string; name: string };

export const teamLinkInclude = {
  supplier: { select: { id: true, isDeleted: true, name: true } },
} satisfies Prisma.supplier_identity_linksInclude;

export async function resolveTeamSupplierIdentity(
  teamId: string,
  client: Pick<Prisma.TransactionClient, 'supplier_identity_links'> = prisma,
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
  return result;
}
