import { nanoid } from 'nanoid';

import prisma from './prisma';

export function createAfterSalesId(): string {
  return `AS-${new Date().getFullYear()}-${nanoid(8).toUpperCase()}`;
}

export async function getNextAfterSalesSerialNumber(): Promise<number> {
  const result = await prisma.after_sales.aggregate({
    _max: { serialNumber: true },
  });
  return (result._max.serialNumber || 0) + 1;
}
