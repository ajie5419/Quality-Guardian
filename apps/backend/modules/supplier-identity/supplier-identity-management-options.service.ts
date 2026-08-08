import type { SupplierIdentityOptionsQuery } from './supplier-identity.schema';

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
  const [suppliers, teams] = await Promise.all([
    prisma.suppliers.findMany({
      where: {
        isDeleted: false,
        ...(keyword ? { name: { contains: keyword } } : {}),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
      take,
    }),
    prisma.dictionaries.findMany({
      where: {
        dictType: 'team',
        isDeleted: false,
        status: 1,
        ...(keyword ? { dictKey: { contains: keyword } } : {}),
      },
      orderBy: [{ sort: 'asc' }, { dictKey: 'asc' }],
      select: { dictKey: true, id: true },
      take,
    }),
  ]);
  return {
    suppliers: suppliers.map((supplier) => ({
      label: supplier.name,
      value: supplier.id,
    })),
    teams: teams.map((team) => ({ label: team.dictKey, value: team.id })),
  };
}
