import process from 'node:process';

import prisma from '../utils/prisma';

type CountRow = {
  missingProcessId: bigint | number | string;
  totalWithProcessName: bigint | number | string;
};

type TableCheck = {
  missingProcessId: number;
  table: string;
  totalWithProcessName: number;
};

const TABLES = [
  'inspections',
  'quality_records',
  'work_order_requirements',
  'qms_inspection_requests',
  'inspection_form_templates',
] as const;

function toNumber(value: bigint | number | string | undefined) {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function checkTable(table: string): Promise<TableCheck> {
  const rows = await prisma.$queryRawUnsafe<CountRow[]>(
    `SELECT
       SUM(CASE
         WHEN processName IS NOT NULL AND TRIM(processName) <> '' THEN 1
         ELSE 0
       END) AS totalWithProcessName,
       SUM(CASE
         WHEN processName IS NOT NULL AND TRIM(processName) <> '' AND processId IS NULL THEN 1
         ELSE 0
       END) AS missingProcessId
     FROM ${table}`,
  );
  const row = rows[0];
  return {
    table,
    totalWithProcessName: toNumber(row?.totalWithProcessName),
    missingProcessId: toNumber(row?.missingProcessId),
  };
}

async function main() {
  const results: TableCheck[] = [];
  for (const table of TABLES) {
    const result = await checkTable(table);
    results.push(result);
  }

  const totalWithProcessName = results.reduce(
    (sum, item) => sum + item.totalWithProcessName,
    0,
  );
  const totalMissingProcessId = results.reduce(
    (sum, item) => sum + item.missingProcessId,
    0,
  );

  const summary = {
    summary: {
      allAligned: totalMissingProcessId === 0,
      totalMissingProcessId,
      totalWithProcessName,
    },
    tables: results,
  };

  console.warn('[check-process-id-consistency] result');
  console.warn(JSON.stringify(summary, null, 2));

  if (totalMissingProcessId > 0) {
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
