import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const wos = await prisma.work_orders.findMany({
    where: {
      workOrderNumber: {
        contains: '23TL'
      }
    }
  });
  console.log('Found Work Orders:', JSON.stringify(wos, null, 2));
}
main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
