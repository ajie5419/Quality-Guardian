import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Checking work_orders table...");
  
  // Find work orders that look like the target format
  const workOrders = await prisma.work_orders.findMany({
    where: {
      workOrderNumber: {
        contains: '23TL-CL'
      }
    },
    select: {
      workOrderNumber: true
    }
  });

  console.log(`Found ${workOrders.length} matching work orders:`);
  workOrders.forEach(wo => {
    console.log(wo.workOrderNumber);
  });
  
  // Also just list first 10 to see general format if nothing matches
  if (workOrders.length === 0) {
      console.log("No matches found for '23TL-CL'. Listing first 10 work orders to see format:");
      const allWorkOrders = await prisma.work_orders.findMany({
          take: 10,
          select: {
              workOrderNumber: true
          }
      });
      allWorkOrders.forEach(wo => {
          console.log(wo.workOrderNumber);
      });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
