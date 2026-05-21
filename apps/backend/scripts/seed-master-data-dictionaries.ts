import { randomUUID } from 'node:crypto';
import process from 'node:process';

import prisma from '../utils/prisma';

type ValueRow = { value: null | string };

interface SeedConfig {
  dictType: 'defect_subtype' | 'defect_type' | 'team';
  queries: string[];
}

const SEED_CONFIGS: SeedConfig[] = [
  {
    dictType: 'defect_type',
    queries: [
      `SELECT DISTINCT defectType AS value
       FROM quality_records
       WHERE defectType IS NOT NULL AND TRIM(defectType) <> ''`,
      `SELECT DISTINCT defectType AS value
       FROM after_sales
       WHERE defectType IS NOT NULL AND TRIM(defectType) <> ''`,
    ],
  },
  {
    dictType: 'defect_subtype',
    queries: [
      `SELECT DISTINCT defectSubtype AS value
       FROM quality_records
       WHERE defectSubtype IS NOT NULL AND TRIM(defectSubtype) <> ''`,
      `SELECT DISTINCT defectSubtype AS value
       FROM after_sales
       WHERE defectSubtype IS NOT NULL AND TRIM(defectSubtype) <> ''`,
    ],
  },
  {
    dictType: 'team',
    queries: [
      `SELECT DISTINCT team AS value
       FROM inspections
       WHERE team IS NOT NULL AND TRIM(team) <> ''`,
      `SELECT DISTINCT team AS value
       FROM qms_inspection_requests
       WHERE team IS NOT NULL AND TRIM(team) <> ''`,
      `SELECT DISTINCT team AS value
       FROM welders
       WHERE team IS NOT NULL AND TRIM(team) <> ''`,
    ],
  },
];

function normalizeValue(value: null | string) {
  return String(value || '').trim();
}

async function collectDistinctValues(queries: string[]) {
  const valueSet = new Set<string>();
  for (const sql of queries) {
    const rows = await prisma.$queryRawUnsafe<ValueRow[]>(sql);
    for (const row of rows) {
      const value = normalizeValue(row.value);
      if (value) {
        valueSet.add(value);
      }
    }
  }
  return [...valueSet].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

async function seedByConfig(config: SeedConfig) {
  const values = await collectDistinctValues(config.queries);
  let inserted = 0;

  for (const [sort, value] of values.entries()) {
    const affectedRows = await prisma.$executeRawUnsafe(
      `INSERT IGNORE INTO dictionaries (
         id, dictType, dictKey, dictValue, sort, status, isDeleted
       ) VALUES (?, ?, ?, ?, ?, 1, 0)`,
      randomUUID(),
      config.dictType,
      value,
      value,
      sort,
    );
    inserted += Number(affectedRows || 0);
  }

  return {
    dictType: config.dictType,
    collected: values.length,
    inserted,
  };
}

async function main() {
  const summaries = [];
  for (const config of SEED_CONFIGS) {
    const summary = await seedByConfig(config);
    summaries.push(summary);
    console.warn(
      `[seed-master-data-dictionaries] ${summary.dictType}: collected=${summary.collected}, inserted=${summary.inserted}`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error('[seed-master-data-dictionaries] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
