import prisma from '~/utils/prisma';

import { resolveSuppliersByTeamIds } from './supplier-identity-name-resolver';

export async function listSupplierIdentityTeamOptions(keyword = '') {
  const normalizedKeyword = keyword.trim();
  const teams = await prisma.dictionaries.findMany({
    where: {
      dictType: 'team',
      isDeleted: false,
      status: 1,
      ...(normalizedKeyword
        ? { dictKey: { contains: normalizedKeyword } }
        : {}),
    },
    orderBy: [{ sort: 'asc' }, { dictKey: 'asc' }],
    take: 100,
    select: { dictKey: true, id: true },
  });
  const linkedSuppliers = await resolveSuppliersByTeamIds(
    teams.map((team) => team.id),
  );
  return teams.map((team) => ({
    group: linkedSuppliers.has(team.id)
      ? ('external' as const)
      : ('internal' as const),
    label: team.dictKey,
    value: team.id,
  }));
}

export async function listTeamIdsForSupplier(supplierId: string) {
  const links = await prisma.supplier_identity_links.findMany({
    select: { identityId: true },
    where: {
      identityType: 'TEAM',
      isDeleted: false,
      supplierId,
    },
  });
  return links.map((link) => link.identityId);
}

export async function listTeamIdsBySupplierIds(supplierIds: string[]) {
  const ids = [
    ...new Set(
      supplierIds.map((supplierId) => String(supplierId || '').trim()),
    ),
  ].filter(Boolean);
  if (ids.length === 0) return new Map<string, string[]>();
  const links = await prisma.supplier_identity_links.findMany({
    select: { identityId: true, supplierId: true },
    where: {
      identityType: 'TEAM',
      isDeleted: false,
      supplierId: { in: ids },
    },
  });
  const result = new Map<string, string[]>();
  for (const link of links) {
    const teamIds = result.get(link.supplierId) || [];
    teamIds.push(link.identityId);
    result.set(link.supplierId, teamIds);
  }
  return result;
}
