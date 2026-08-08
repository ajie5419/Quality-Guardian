import {
  EXTERNAL_SERVICE_OUTSOURCING_MODE,
  IN_HOUSE_OUTSOURCING_MODE,
  OUTSOURCING_CATEGORY,
} from '@qgs/shared';
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
  const teamIds = await listTeamIdsBySupplierIds([supplierId]);
  return teamIds.get(supplierId.trim()) || [];
}

export async function listTeamIdsBySupplierIds(supplierIds: string[]) {
  const ids = [
    ...new Set(
      supplierIds.map((supplierId) => String(supplierId || '').trim()),
    ),
  ].filter(Boolean);
  if (ids.length === 0) return new Map<string, string[]>();
  const suppliers = await prisma.suppliers.findMany({
    select: { id: true },
    where: {
      category: OUTSOURCING_CATEGORY,
      id: { in: ids },
      isDeleted: false,
      outsourcingMode: {
        in: [IN_HOUSE_OUTSOURCING_MODE, EXTERNAL_SERVICE_OUTSOURCING_MODE],
      },
    },
  });
  const eligibleSupplierIds = suppliers.map((supplier) => supplier.id);
  if (eligibleSupplierIds.length === 0) return new Map<string, string[]>();
  const links = await prisma.supplier_identity_links.findMany({
    select: { identityId: true, supplierId: true },
    where: {
      identityType: 'TEAM',
      isDeleted: false,
      supplierId: { in: eligibleSupplierIds },
    },
  });
  if (links.length === 0) return new Map<string, string[]>();
  const linkedTeamIds = [...new Set(links.map((link) => link.identityId))];
  const sources = await prisma.team_identity_sources.findMany({
    select: { sourceId: true, teamId: true },
    where: {
      isDeleted: false,
      sourceId: { in: eligibleSupplierIds },
      sourceType: 'SUPPLIER',
      teamId: { in: linkedTeamIds },
    },
  });
  const sourcePairs = new Set(
    sources.map((source) => `${source.sourceId}:${source.teamId}`),
  );
  const teams = await prisma.dictionaries.findMany({
    select: { id: true },
    where: {
      dictType: 'team',
      id: { in: linkedTeamIds },
      isDeleted: false,
      status: 1,
    },
  });
  const activeTeamIds = new Set(teams.map((team) => team.id));
  const result = new Map<string, string[]>();
  for (const link of links) {
    if (
      !activeTeamIds.has(link.identityId) ||
      !sourcePairs.has(`${link.supplierId}:${link.identityId}`)
    ) {
      continue;
    }
    const teamIds = result.get(link.supplierId) || [];
    teamIds.push(link.identityId);
    result.set(link.supplierId, teamIds);
  }
  return result;
}
