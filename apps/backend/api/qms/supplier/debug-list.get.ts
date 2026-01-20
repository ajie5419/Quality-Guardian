import { defineEventHandler } from 'h3';
import prisma from '~/utils/prisma';

export default defineEventHandler(async () => {
  const suppliers = await prisma.suppliers.findMany({
    select: { id: true, name: true, category: true },
  });
  return { count: suppliers.length, suppliers };
});
