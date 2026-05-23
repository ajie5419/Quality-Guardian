import process from 'node:process';

import { MasterDataGovernanceKernel } from '../utils/master-data-governance-kernel';
import prisma from '../utils/prisma';

async function main() {
  const rowsByField = await Promise.all(
    ['processName', 'team'].map(async (fieldKey) => {
      const rows =
        await MasterDataGovernanceKernel.auditMissingCanonicalIds(fieldKey);
      return {
        fieldKey,
        rows,
      };
    }),
  );
  const totals = rowsByField.map((item) => ({
    fieldKey: item.fieldKey,
    totalMissingCanonicalId: item.rows.reduce(
      (sum, row) => sum + row.missingCanonicalId,
      0,
    ),
    totalWithName: item.rows.reduce((sum, row) => sum + row.totalWithName, 0),
  }));
  const totalMissingCanonicalId = totals.reduce(
    (sum, item) => sum + item.totalMissingCanonicalId,
    0,
  );

  const summary = {
    summary: {
      allAligned: totalMissingCanonicalId === 0,
      totalMissingCanonicalId,
      fields: totals,
    },
    tables: rowsByField.flatMap((item) =>
      item.rows.map((row) => ({
        fieldKey: item.fieldKey,
        table: row.table,
        totalWithName: row.totalWithName,
        missingCanonicalId: row.missingCanonicalId,
      })),
    ),
  };

  console.warn('[check-process-id-consistency] result');
  console.warn(JSON.stringify(summary, null, 2));

  if (totalMissingCanonicalId > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error('[check-process-id-consistency] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
