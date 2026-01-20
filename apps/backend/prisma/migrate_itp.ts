import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrate() {
  console.log('Starting ITP data migration...');
  const plans = await prisma.quality_plans.findMany({
    where: {
      NOT: {
        itpItems: null,
      },
    },
  });

  console.log(`Found ${plans.length} plans with potential JSON data.`);

  for (const plan of plans) {
    if (!plan.itpItems) continue;

    try {
      const items = JSON.parse(plan.itpItems);
      if (Array.isArray(items)) {
        console.log(`Migrating ${items.length} items for plan: ${plan.projectName}`);
        
        for (const item of items) {
          // Check if already exists to prevent duplicates (id is from nanoid in old code)
          const exists = await prisma.itp_items.findUnique({
            where: { id: item.id }
          });

          if (!exists) {
            await prisma.itp_items.create({
              data: {
                id: item.id,
                projectId: plan.id,
                processStep: item.processStep || '组对',
                activity: item.activity || '',
                controlPoint: item.controlPoint || 'W',
                acceptanceCriteria: item.acceptanceCriteria || '',
                referenceDoc: item.referenceDoc || '',
                frequency: item.frequency || '100%',
                verifyingDocument: item.verifyingDocument || '',
                isQuantitative: !!item.isQuantitative,
                quantitativeItems: item.quantitativeItems ? JSON.stringify(item.quantitativeItems) : '[]',
                order: item.order || 0,
                createdAt: plan.createdAt,
                updatedAt: plan.updatedAt,
              }
            });
          }
        }
      }
    } catch (e) {
      console.error(`Failed to migrate plan ${plan.id}:`, e);
    }
  }

  console.log('Migration completed.');
}

migrate()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
