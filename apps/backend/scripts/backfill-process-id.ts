import { randomUUID } from 'node:crypto';
import process from 'node:process';

import prisma from '../utils/prisma';

type ProcessNameRow = { processName: null | string };
type ProcessRow = { id: string; name: string };

interface BackfillTarget {
  idColumn: string;
  nameColumn: string;
  table: string;
}

const BATCH_SIZE = 1000;

const TARGETS: BackfillTarget[] = [
  {
    table: 'inspections',
    idColumn: 'id',
    nameColumn: 'processName',
  },
  {
    table: 'quality_records',
    idColumn: 'id',
    nameColumn: 'processName',
  },
  {
    table: 'work_order_requirements',
    idColumn: 'id',
    nameColumn: 'processName',
  },
  {
    table: 'qms_inspection_requests',
    idColumn: 'id',
    nameColumn: 'processName',
  },
  {
    table: 'inspection_form_templates',
    idColumn: 'id',
    nameColumn: 'processName',
  },
];

function normalizeText(value: null | string) {
  return String(value || '').trim();
}

async function readDictionaryProcessNames() {
  const rows = await prisma.$queryRawUnsafe<ProcessNameRow[]>(
    `SELECT DISTINCT dictValue AS processName
     FROM dictionaries
     WHERE isDeleted = 0
       AND status = 1
       AND dictType = 'inspection_process_name'
       AND dictValue IS NOT NULL
       AND TRIM(dictValue) <> ''`,
  );
  const valueSet = new Set<string>();
  for (const row of rows) {
    const processName = normalizeText(row.processName);
    if (processName) {
      valueSet.add(processName);
    }
  }
  return [...valueSet].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

async function seedProcessesFromDictionary(processNames: string[]) {
  for (const [sort, processName] of processNames.entries()) {
    await prisma.$executeRawUnsafe(
      `INSERT IGNORE INTO processes (
         id, name, code, sort, status, isDeleted, createdAt, updatedAt
       ) VALUES (?, ?, NULL, ?, 1, 0, NOW(3), NOW(3))`,
      randomUUID(),
      processName,
      sort,
    );
  }
}

async function backfillTarget(
  target: BackfillTarget,
  processMap: Map<string, string>,
) {
  let totalUpdated = 0;
  const tableName = `\`${target.table}\``;
  const idColumn = `\`${target.idColumn}\``;
  const nameColumn = `\`${target.nameColumn}\``;

  while (true) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; processName: string }>
    >(
      `SELECT ${idColumn} AS id, ${nameColumn} AS processName
       FROM ${tableName}
       WHERE processId IS NULL
         AND ${nameColumn} IS NOT NULL
         AND TRIM(${nameColumn}) <> ''
       LIMIT ?`,
      BATCH_SIZE,
    );

    if (rows.length === 0) {
      break;
    }

    const updatePairs: Array<{ id: string; processId: string }> = [];
    for (const row of rows) {
      const processId = processMap.get(normalizeText(row.processName));
      if (!processId) continue;
      updatePairs.push({ id: row.id, processId });
    }

    if (updatePairs.length === 0) {
      break;
    }

    const caseWhenSql = updatePairs.map(() => 'WHEN ? THEN ?').join(' ');
    const idPlaceholders = updatePairs.map(() => '?').join(', ');
    const params: Array<number | string> = [];
    for (const pair of updatePairs) {
      params.push(pair.id, pair.processId);
    }
    for (const pair of updatePairs) {
      params.push(pair.id);
    }

    const affectedRows = await prisma.$executeRawUnsafe(
      `UPDATE ${tableName}
       SET processId = CASE ${idColumn} ${caseWhenSql} ELSE processId END
       WHERE ${idColumn} IN (${idPlaceholders})`,
      ...params,
    );

    totalUpdated += Number(affectedRows || 0);
    if (rows.length < BATCH_SIZE) {
      break;
    }
  }

  return totalUpdated;
}

async function main() {
  const processNames = await readDictionaryProcessNames();
  console.warn(
    `[backfill-process-id] dictionary process names=${processNames.length}`,
  );

  await seedProcessesFromDictionary(processNames);

  const processRows = await prisma.$queryRawUnsafe<ProcessRow[]>(
    `SELECT id, name FROM processes WHERE isDeleted = 0`,
  );
  const processMap = new Map<string, string>();
  for (const row of processRows) {
    const processName = normalizeText(row.name);
    if (processName && !processMap.has(processName)) {
      processMap.set(processName, row.id);
    }
  }

  for (const target of TARGETS) {
    const updatedRows = await backfillTarget(target, processMap);
    console.warn(
      `[backfill-process-id] table=${target.table}, updatedRows=${updatedRows}`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error('[backfill-process-id] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
