import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  try {
    const wos = await prisma.work_orders.findMany({
      where: {
        workOrderNumber: {
          contains: '23TL'
        }
      }
    });
    console.log('Found Work Orders:', JSON.stringify(wos, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
