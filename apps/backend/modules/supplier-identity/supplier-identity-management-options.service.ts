import type { SupplierIdentityOptionsQuery } from './supplier-identity.schema';

import { resolveSupplierInspectionPolicy } from '@qgs/shared';
import prisma from '~/utils/prisma';

/**
 * Management selectors deliberately query the whole active identity domain.
 * Data-scope filtering would hide valid targets from a system-admin mapping.
 */
export async function listSupplierIdentityManagementOptions(
  params: SupplierIdentityOptionsQuery,
) {
  const keyword = params.keyword?.trim() || '';
  const take = Math.min(Math.max(params.take || 100, 1), 100);
  const sources = await prisma.team_identity_sources.findMany({
    where: { isDeleted: false, sourceType: 'SUPPLIER' },
    select: { sourceId: true, teamId: true },
  });
  const supplierRows = await prisma.suppliers.findMany({
    where: {
      id: { in: [...new Set(sources.map((source) => source.sourceId))] },
      isDeleted: false,
      ...(keyword && params.target !== 'team'
        ? { name: { contains: keyword } }
        : {}),
    },
    orderBy: { name: 'asc' },
    select: { category: true, id: true, name: true, outsourcingMode: true },
    take,
  });
  const suppliers = supplierRows.filter(
    (supplier) =>
      resolveSupplierInspectionPolicy(supplier).identitySource === 'team',
  );
  const supplierIds = new Set(suppliers.map((supplier) => supplier.id));
  const validSources = sources.filter((source) =>
    supplierIds.has(source.sourceId),
  );
  const teamIds = [
    ...new Set(
      validSources
        .filter((source) => !params.teamId || source.teamId === params.teamId)
        .map((source) => source.teamId),
    ),
  ];
  const teams = await prisma.dictionaries.findMany({
    where: {
      dictType: 'team',
      id: { in: teamIds },
      isDeleted: false,
      status: 1,
      ...(keyword && params.target !== 'supplier'
        ? { dictKey: { contains: keyword } }
        : {}),
    },
    orderBy: [{ sort: 'asc' }, { dictKey: 'asc' }],
    select: { dictKey: true, id: true },
    take,
  });
  const supplierIdsForSelectedTeam = new Set(
    validSources
      .filter((source) => !params.teamId || source.teamId === params.teamId)
      .map((source) => source.sourceId),
  );
  return {
    suppliers: suppliers
      .filter((supplier) => supplierIdsForSelectedTeam.has(supplier.id))
      .map((supplier) => ({
        label: supplier.name,
        value: supplier.id,
      })),
    teams: teams.map((team) => ({ label: team.dictKey, value: team.id })),
  };
}
