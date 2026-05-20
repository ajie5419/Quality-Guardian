import prisma from './prisma';

export async function getNextAfterSalesSerialNumber(): Promise<number> {
  const result = await prisma.after_sales.aggregate({
    _max: { serialNumber: true },
  });
  return (result._max.serialNumber || 0) + 1;
}

export { createAfterSalesId } from '@qgs/domain';
