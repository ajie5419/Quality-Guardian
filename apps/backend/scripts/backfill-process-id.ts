import process from 'node:process';

import { MasterDataGovernanceKernel } from '../core/master-data/governance-kernel';
import prisma from '../utils/prisma';

async function main() {
  const fieldKeys = ['processName', 'team'];
  const results = [];
  for (const configKey of fieldKeys) {
    const result = await MasterDataGovernanceKernel.backfillCanonicalIds({
      configKey,
      batchSize: 1000,
      seedCanonicalFromSource: true,
    });
    results.push({
      configKey,
      updatedByTable: result.updatedByTable,
    });
  }

  console.warn('[backfill-process-id] result');
  console.warn(JSON.stringify(results, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error('[backfill-process-id] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
