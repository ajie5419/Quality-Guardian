import { randomUUID } from 'node:crypto';
import process from 'node:process';

import {
  getMasterDataGovernanceField,
  listMasterDataGovernanceFields,
} from '../utils/master-data-governance-registry';
import prisma from '../utils/prisma';

type ValueCountRow = { count: bigint | number | string; value: null | string };
type ValueRow = { value: null | string };
type MasterDataGovernanceField =
  import('../utils/master-data-governance-registry').MasterDataGovernanceField;

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const [key, value = ''] = item.slice(2).split('=');
    args.set(key, value);
  }
  return args;
}

function parseBool(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === '') return fallback;
  const normalized = value.toLowerCase().trim();
  if (['1', 'on', 'true', 'y', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'n', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeValue(value: unknown) {
  return String(value || '').trim();
}

function quoteIdentifier(value: string) {
  if (!/^[_a-z]\w*$/i.test(value)) {
    throw new Error(`UNSAFE_IDENTIFIER:${value}`);
  }
  return `\`${value}\``;
}

function toNumber(value: bigint | number | string | undefined) {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchSourceValues(field: MasterDataGovernanceField) {
  const values = new Set<string>();
  const source = field.source;

  if (source.type === 'dictionary') {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ key: string; value: string }>
    >(
      `SELECT dictKey AS \`key\`, dictValue AS value
       FROM dictionaries
       WHERE isDeleted = 0 AND status = 1 AND dictType = ?`,
      source.dictType,
    );
    for (const row of rows) {
      const key = normalizeValue(row.key);
      const value = normalizeValue(row.value);
      if (key) values.add(key);
      if (value) values.add(value);
    }
    return values;
  }

  if (source.type === 'table') {
    const tableName = quoteIdentifier(source.table);
    const valueColumn = quoteIdentifier(source.valueColumn);
    const whereSql = source.where ? ` AND ${source.where}` : '';
    const rows = await prisma.$queryRawUnsafe<ValueRow[]>(
      `SELECT DISTINCT ${valueColumn} AS value
       FROM ${tableName}
       WHERE ${valueColumn} IS NOT NULL AND TRIM(${valueColumn}) <> ''${whereSql}`,
    );
    for (const row of rows) {
      const value = normalizeValue(row.value);
      if (value) values.add(value);
    }
    return values;
  }

  const rows = await prisma.$queryRawUnsafe<ValueRow[]>(source.valueSql);
  for (const row of rows) {
    const value = normalizeValue(row.value);
    if (value) values.add(value);
  }
  return values;
}

async function seedTableSourceValues(
  field: MasterDataGovernanceField,
  missingValues: string[],
  dryRun: boolean,
) {
  if (field.source.type !== 'table' || missingValues.length === 0) {
    return { inserted: 0, target: null as null | string };
  }
  if (field.key === 'supplierName') {
    if (dryRun) {
      return { inserted: missingValues.length, target: 'suppliers.name' };
    }
    for (const value of missingValues) {
      await prisma.$executeRawUnsafe(
        `INSERT IGNORE INTO suppliers (
           id, name, code, contact, phone, address, status, isDeleted, createdAt, updatedAt
         ) VALUES (?, ?, ?, '', '', '', 1, 0, NOW(3), NOW(3))`,
        randomUUID(),
        value,
        value,
      );
    }
    return { inserted: missingValues.length, target: 'suppliers.name' };
  }
  if (field.key === 'responsibleDepartment') {
    if (dryRun) {
      return { inserted: missingValues.length, target: 'departments.name' };
    }
    for (const value of missingValues) {
      await prisma.$executeRawUnsafe(
        `INSERT IGNORE INTO departments (
           id, name, businessUnit, description, status, parentId, sort, isDeleted, createdAt, updatedAt, version
         ) VALUES (?, ?, NULL, NULL, 1, '0', 0, 0, NOW(3), NOW(3), 1)`,
        randomUUID(),
        value,
      );
    }
    return { inserted: missingValues.length, target: 'departments.name' };
  }
  return { inserted: 0, target: null as null | string };
}

async function seedDictionarySourceValues(
  field: MasterDataGovernanceField,
  missingValues: string[],
  dryRun: boolean,
) {
  if (field.source.type !== 'dictionary' || missingValues.length === 0) {
    return { inserted: 0, target: null as null | string };
  }
  if (dryRun) {
    return {
      inserted: missingValues.length,
      target: `dictionaries.${field.source.dictType}`,
    };
  }
  for (const [index, value] of missingValues.entries()) {
    await prisma.$executeRawUnsafe(
      `INSERT IGNORE INTO dictionaries (
         id, dictType, dictKey, dictValue, sort, status, isDeleted
       ) VALUES (?, ?, ?, ?, ?, 1, 0)`,
      randomUUID(),
      field.source.dictType,
      value,
      value,
      index,
    );
  }
  return {
    inserted: missingValues.length,
    target: `dictionaries.${field.source.dictType}`,
  };
}

async function collectFieldOrphans(fieldKey: string) {
  const field = getMasterDataGovernanceField(fieldKey);
  if (!field) {
    throw new Error(`INVALID_FIELD:${fieldKey}`);
  }
  const sourceValues = await fetchSourceValues(field);
  const rowsByValue = new Map<string, { count: number; tables: Set<string> }>();

  for (const target of field.targets) {
    const tableName = quoteIdentifier(target.table);
    const nameColumn = quoteIdentifier(target.nameColumn);
    const rows = await prisma.$queryRawUnsafe<ValueCountRow[]>(
      `SELECT ${nameColumn} AS value, COUNT(1) AS count
       FROM ${tableName}
       WHERE isDeleted = 0
         AND ${nameColumn} IS NOT NULL
         AND TRIM(${nameColumn}) <> ''
       GROUP BY ${nameColumn}`,
    );

    for (const row of rows) {
      const value = normalizeValue(row.value);
      if (!value || sourceValues.has(value)) continue;
      const existing = rowsByValue.get(value);
      if (existing) {
        existing.count += toNumber(row.count);
        existing.tables.add(target.table);
      } else {
        rowsByValue.set(value, {
          count: toNumber(row.count),
          tables: new Set([target.table]),
        });
      }
    }
  }

  return [...rowsByValue.entries()]
    .map(([value, data]) => ({
      value,
      count: data.count,
      tables: [...data.tables].sort(),
    }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fieldsArg = String(args.get('fields') || '').trim();
  const dryRun = parseBool(args.get('dryRun'), true);
  const fieldKeys = fieldsArg
    ? fieldsArg
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : listMasterDataGovernanceFields()
        .filter((field) => field.auditPolicy === 'orphan-only')
        .map((field) => field.key);

  const results = [];
  for (const fieldKey of fieldKeys) {
    const field = getMasterDataGovernanceField(fieldKey);
    if (!field) {
      throw new Error(`INVALID_FIELD:${fieldKey}`);
    }

    const orphans = await collectFieldOrphans(fieldKey);
    const missingValues = orphans.map((item) => item.value);
    const dictionarySeed = await seedDictionarySourceValues(
      field,
      missingValues,
      dryRun,
    );
    const tableSeed = await seedTableSourceValues(field, missingValues, dryRun);

    results.push({
      fieldKey,
      dryRun,
      orphanRows: orphans.reduce((sum, item) => sum + item.count, 0),
      orphanValues: orphans.length,
      seeded: {
        dictionary: dictionarySeed,
        table: tableSeed,
      },
      samples: orphans.slice(0, 20),
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    dryRun,
    fields: results,
    totals: {
      fields: results.length,
      orphanRows: results.reduce((sum, item) => sum + item.orphanRows, 0),
      orphanValues: results.reduce((sum, item) => sum + item.orphanValues, 0),
      seededRows: results.reduce(
        (sum, item) =>
          sum + item.seeded.dictionary.inserted + item.seeded.table.inserted,
        0,
      ),
    },
  };

  console.warn('[repair-master-data-orphans] result');
  console.warn(JSON.stringify(summary, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error('[repair-master-data-orphans] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
