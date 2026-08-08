import type { SupplierIdentityOptionsQuery } from './supplier-identity.schema';

import {
  EXTERNAL_SERVICE_OUTSOURCING_MODE,
  IN_HOUSE_OUTSOURCING_MODE,
  OUTSOURCING_CATEGORY,
  resolveSupplierInspectionPolicy,
} from '@qgs/shared';
import prisma from '~/utils/prisma';

type TeamOption = { dictKey: string; id: string };

async function listKeywordTeamCandidates(
  params: SupplierIdentityOptionsQuery,
  keyword: string,
  take: number,
) {
  if (params.target !== 'team') return null;
  return prisma.dictionaries.findMany({
    where: {
      dictType: 'team',
      isDeleted: false,
      status: 1,
      teamIdentitySources: {
        some: { isDeleted: false, sourceType: 'SUPPLIER' },
      },
      ...(keyword ? { dictKey: { contains: keyword } } : {}),
    },
    orderBy: [{ sort: 'asc' }, { dictKey: 'asc' }],
    select: { dictKey: true, id: true },
    take,
  });
}

async function listBoundedSupplierSources(
  options: { supplierIds?: string[]; teamIds?: string[] },
  take: number,
) {
  if (options.supplierIds?.length === 0 || options.teamIds?.length === 0) {
    return [];
  }
  return prisma.team_identity_sources.findMany({
    where: {
      isDeleted: false,
      sourceType: 'SUPPLIER',
      ...(options.supplierIds ? { sourceId: { in: options.supplierIds } } : {}),
      ...(options.teamIds ? { teamId: { in: options.teamIds } } : {}),
    },
    select: { sourceId: true, teamId: true },
    take,
  });
}

async function listKeywordSupplierCandidates(
  params: SupplierIdentityOptionsQuery,
  keyword: string,
  take: number,
) {
  if (params.target === 'team') return null;
  return prisma.suppliers.findMany({
    where: {
      category: OUTSOURCING_CATEGORY,
      isDeleted: false,
      outsourcingMode: {
        in: [IN_HOUSE_OUTSOURCING_MODE, EXTERNAL_SERVICE_OUTSOURCING_MODE],
      },
      ...(keyword ? { name: { contains: keyword } } : {}),
    },
    orderBy: { name: 'asc' },
    select: { category: true, id: true, name: true, outsourcingMode: true },
    take,
  });
}

async function listSelectedTeams(
  candidateTeams: null | TeamOption[],
  teamIds: string[],
  take: number,
) {
  if (candidateTeams) {
    const validTeamIds = new Set(teamIds);
    return candidateTeams.filter((team) => validTeamIds.has(team.id));
  }
  if (teamIds.length === 0) return [];
  return prisma.dictionaries.findMany({
    where: {
      dictType: 'team',
      id: { in: teamIds },
      isDeleted: false,
      status: 1,
    },
    orderBy: [{ sort: 'asc' }, { dictKey: 'asc' }],
    select: { dictKey: true, id: true },
    take,
  });
}

/**
 * System administrators need cross-scope candidates, but every query remains
 * capped at the API page size. The exact source pair is still revalidated by
 * the mutation service, so a bounded selector can never authorize a mismatch.
 */
export async function listSupplierIdentityManagementOptions(
  params: SupplierIdentityOptionsQuery,
) {
  const keyword = params.keyword?.trim() || '';
  const take = Math.min(Math.max(params.take || 100, 1), 100);
  const candidateTeams = await listKeywordTeamCandidates(params, keyword, take);
  const candidateSuppliers = await listKeywordSupplierCandidates(
    params,
    keyword,
    take,
  );
  const sourceTeamIds = params.teamId
    ? [params.teamId]
    : candidateTeams?.map((team) => team.id);
  const sources = await listBoundedSupplierSources(
    {
      supplierIds: candidateSuppliers?.map((supplier) => supplier.id),
      teamIds: sourceTeamIds,
    },
    take,
  );
  const supplierRows =
    candidateSuppliers ||
    (sources.length === 0
      ? []
      : await prisma.suppliers.findMany({
          where: {
            id: { in: [...new Set(sources.map((source) => source.sourceId))] },
            isDeleted: false,
            ...(keyword && params.target !== 'team'
              ? { name: { contains: keyword } }
              : {}),
          },
          orderBy: { name: 'asc' },
          select: {
            category: true,
            id: true,
            name: true,
            outsourcingMode: true,
          },
          take,
        }));
  const supplierIds = new Set(
    supplierRows
      .filter(
        (supplier) =>
          resolveSupplierInspectionPolicy(supplier).identitySource === 'team',
      )
      .map((supplier) => supplier.id),
  );
  const validSources = sources.filter((source) =>
    supplierIds.has(source.sourceId),
  );
  const teamIds = [...new Set(validSources.map((source) => source.teamId))];
  const teams = await listSelectedTeams(candidateTeams, teamIds, take);
  const supplierIdsForSelectedTeam = new Set(
    validSources.map((source) => source.sourceId),
  );
  return {
    suppliers: supplierRows
      .filter((supplier) => supplierIdsForSelectedTeam.has(supplier.id))
      .map((supplier) => ({ label: supplier.name, value: supplier.id })),
    teams: teams.map((team) => ({ label: team.dictKey, value: team.id })),
  };
}
