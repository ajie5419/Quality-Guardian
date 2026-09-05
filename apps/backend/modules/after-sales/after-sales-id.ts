import type { Prisma } from '@prisma/client';

import prisma from '~/utils/prisma';

export async function getNextAfterSalesSerialNumber(
  client: Pick<Prisma.TransactionClient, 'after_sales'> = prisma,
): Promise<number> {
  const result = await client.after_sales.aggregate({
    _max: { serialNumber: true },
  });
  return (result._max.serialNumber || 0) + 1;
}

export { createAfterSalesId } from '@qgs/shared';
