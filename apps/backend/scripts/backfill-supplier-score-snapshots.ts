import { SupplierScoreSnapshotService } from '~/modules/supplier';
import prisma from '~/utils/prisma';

async function main() {
  await SupplierScoreSnapshotService.refreshAll();
}

main()
  .catch((error: unknown) => {
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
