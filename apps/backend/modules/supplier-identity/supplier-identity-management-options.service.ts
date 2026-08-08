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
  const [supplierRows, teams] = await Promise.all([
    prisma.suppliers.findMany({
      where: {
        isDeleted: false,
        ...(keyword ? { name: { contains: keyword } } : {}),
      },
      orderBy: { name: 'asc' },
      select: { category: true, id: true, name: true, outsourcingMode: true },
      take,
    }),
    prisma.dictionaries.findMany({
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
    }),
  ]);
  return {
    suppliers: supplierRows
      .filter(
        (supplier) =>
          resolveSupplierInspectionPolicy(supplier).identitySource === 'team',
      )
      .map((supplier) => ({
        label: supplier.name,
        value: supplier.id,
      })),
    teams: teams.map((team) => ({ label: team.dictKey, value: team.id })),
  };
}
