import { defineEventHandler } from 'h3';
import prisma from '~/utils/prisma';

export default defineEventHandler(async () => {
  try {
    const newSupplier = await prisma.suppliers.create({
      data: {
        name: `Test Outsourcing ${Date.now()}`,
        category: 'Outsourcing',
        brand: 'Test Service',
        productName: 'Test Processing',
        buyer: 'Tester',
        status: 'Qualified',
      },
    });
    return { success: true, data: newSupplier };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
