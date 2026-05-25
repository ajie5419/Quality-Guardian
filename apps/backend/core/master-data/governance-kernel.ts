import type {
  MasterDataCanonicalRelation,
  MasterDataGovernanceField,
  MasterDataTarget,
} from './governance-registry';

import { randomUUID } from 'node:crypto';

import prisma from '../../utils/prisma';
import {
  getMasterDataGovernanceField,
  listMasterDataGovernanceFields,
} from './governance-registry';

type CountRow = { count: bigint | number | string };
type DistinctValueRow = { value: null | string };
type ValueCountRow = { count: bigint | number | string; value: null | string };

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface MasterDataRenameResult {
  affectedRows: number;
  field: string;
  model: string;
}

export interface MasterDataOrphanItem {
  configKey: string;
  count: number;
  tables: string[];
  value: string;
}

export interface MissingCanonicalIdItem {
  missingCanonicalId: number;
  table: string;
  totalWithName: number;
}

export interface GovernanceFieldRunResult {
  audit: {
    invalidCanonicalId?: number;
    missingCanonicalId?: number;
    orphanCount: number;
    status: 'pass' | 'warn';
  };
  backfill?: {
    progressByTable: Record<string, BackfillTableProgress>;
    seededCanonicalRows: number;
    updatedByTable: Record<string, number>;
  };
  fieldKey: string;
  seed?: {
    seededCanonicalRows: number;
  };
}

export interface BackfillTableProgress {
  batches: number;
  exhausted: boolean;
  lastScannedId: null | string;
  nextStartAfterId: null | string;
  scannedRows: number;
  unresolvedRows: number;
  updatedRows: number;
}

function normalizeValue(value: unknown) {
  return String(value || '').trim();
}

function qualifyActiveWhereClause(activeWhere: string, alias: string) {
  const normalized = String(activeWhere || '').trim();
  if (!normalized) return '';
  if (!alias) return normalized;
  const keywords = new Set([
    'and',
    'as',
    'between',
    'case',
    'else',
    'end',
    'false',
    'in',
    'is',
    'like',
    'not',
    'null',
    'or',
    'then',
    'true',
    'when',
  ]);
  const parts = normalized.split("'");
  for (let index = 0; index < parts.length; index += 2) {
    parts[index] = parts[index].replaceAll(
      /(?<![\w.`])([A-Z_]\w*)(?![\w`(])/gi,
      (token, identifier: string, offset: number, full: string) => {
        const lower = identifier.toLowerCase();
        if (keywords.has(lower)) return token;
        if (offset > 0 && full[offset - 1] === '.') return token;
        return `${alias}.${identifier}`;
      },
    );
  }
  return parts.join("'");
}

function quoteIdentifier(value: string) {
  if (!/^[_a-z]\w*$/i.test(value)) {
    throw new Error(`UNSAFE_IDENTIFIER:${value}`);
  }
  return `\`${value}\``;
}

const TABLE_COLUMN_CACHE = new Map<string, Set<string>>();
const TABLE_PRIMARY_KEY_CACHE = new Map<null | string, string>();

async function getTableColumnSet(tableName: string) {
  const cached = TABLE_COLUMN_CACHE.get(tableName);
  if (cached) return cached;
  const rows = await prisma.$queryRawUnsafe<Array<{ columnName: string }>>(
    `SELECT COLUMN_NAME AS columnName
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    tableName,
  );
  const columnSet = new Set(
    rows.map((item) => normalizeValue(item.columnName)).filter(Boolean),
  );
  TABLE_COLUMN_CACHE.set(tableName, columnSet);
  return columnSet;
}

async function getSinglePrimaryKeyColumn(tableName: string) {
  const cached = TABLE_PRIMARY_KEY_CACHE.get(tableName);
  if (cached !== undefined) return cached;
  const rows = await prisma.$queryRawUnsafe<Array<{ columnName: string }>>(
    `SELECT COLUMN_NAME AS columnName
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = 'PRIMARY'
     ORDER BY ORDINAL_POSITION ASC`,
    tableName,
  );
  const keys = rows
    .map((item) => normalizeValue(item.columnName))
    .filter(Boolean);
  if (keys.length !== 1) {
    TABLE_PRIMARY_KEY_CACHE.set(tableName, null);
    return null;
  }
  TABLE_PRIMARY_KEY_CACHE.set(tableName, keys[0]);
  return keys[0];
}

async function buildActiveRowWhereSql(tableName: string) {
  const columnSet = await getTableColumnSet(tableName);
  if (columnSet.has('isDeleted')) {
    return '`isDeleted` = 0';
  }
  return '1 = 1';
}

function toAffectedRows(value: bigint | number | string | undefined) {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function queryExactMatchCount(
  tx: TxClient,
  model: string,
  field: string,
  value: string,
) {
  const modelName = quoteIdentifier(model);
  const fieldName = quoteIdentifier(field);
  const rows = await tx.$queryRawUnsafe<CountRow[]>(
    `SELECT COUNT(1) AS count FROM ${modelName} WHERE ${fieldName} = ?`,
    value,
  );
  return toAffectedRows(rows[0]?.count);
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
    const rows = await prisma.$queryRawUnsafe<DistinctValueRow[]>(
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

  const rows = await prisma.$queryRawUnsafe<DistinctValueRow[]>(
    source.valueSql,
  );
  for (const row of rows) {
    const value = normalizeValue(row.value);
    if (value) values.add(value);
  }
  return values;
}

function getFieldOrThrow(configKey: string) {
  const field = getMasterDataGovernanceField(configKey);
  if (!field) {
    throw new Error('INVALID_CONFIG_KEY');
  }
  return field;
}

async function maybeRenameSourceEntity(
  tx: TxClient,
  configKey: string,
  oldValue: string,
  newValue: string,
  dryRun: boolean,
): Promise<MasterDataRenameResult[]> {
  const results: MasterDataRenameResult[] = [];

  if (configKey === 'supplierName') {
    if (dryRun) {
      const count = await queryExactMatchCount(
        tx,
        'suppliers',
        'name',
        oldValue,
      );
      results.push({ model: 'suppliers', field: 'name', affectedRows: count });
    } else {
      const affectedRows = await tx.$executeRawUnsafe(
        `UPDATE suppliers
         SET name = ?
         WHERE isDeleted = 0 AND name = ?`,
        newValue,
        oldValue,
      );
      results.push({
        model: 'suppliers',
        field: 'name',
        affectedRows: toAffectedRows(affectedRows),
      });
    }
  }

  if (configKey === 'responsibleDepartment') {
    if (dryRun) {
      const count = await queryExactMatchCount(
        tx,
        'departments',
        'name',
        oldValue,
      );
      results.push({
        model: 'departments',
        field: 'name',
        affectedRows: count,
      });
    } else {
      const affectedRows = await tx.$executeRawUnsafe(
        `UPDATE departments
         SET name = ?
         WHERE isDeleted = 0 AND name = ?`,
        newValue,
        oldValue,
      );
      results.push({
        model: 'departments',
        field: 'name',
        affectedRows: toAffectedRows(affectedRows),
      });
    }
  }

  return results;
}

async function renameDictionaryRows(
  tx: TxClient,
  dictType: string,
  oldValue: string,
  newValue: string,
  dryRun: boolean,
) {
  if (dryRun) {
    const rows = await tx.$queryRawUnsafe<CountRow[]>(
      `SELECT COUNT(1) AS count
       FROM dictionaries
       WHERE isDeleted = 0
         AND dictType = ?
         AND (dictKey = ? OR dictValue = ?)`,
      dictType,
      oldValue,
      oldValue,
    );
    return {
      model: 'dictionaries',
      field: 'dictKey,dictValue',
      affectedRows: toAffectedRows(rows[0]?.count),
    } satisfies MasterDataRenameResult;
  }

  const affectedRows = await tx.$executeRawUnsafe(
    `UPDATE dictionaries
     SET dictKey = ?, dictValue = ?
     WHERE isDeleted = 0
       AND dictType = ?
       AND (dictKey = ? OR dictValue = ?)`,
    newValue,
    newValue,
    dictType,
    oldValue,
    oldValue,
  );
  return {
    model: 'dictionaries',
    field: 'dictKey,dictValue',
    affectedRows: toAffectedRows(affectedRows),
  } satisfies MasterDataRenameResult;
}

async function readCanonicalNameById(
  canonical: MasterDataCanonicalRelation,
  id: string,
) {
  const table = quoteIdentifier(canonical.table);
  const idColumn = quoteIdentifier(canonical.idColumn);
  const nameColumn = quoteIdentifier(canonical.nameColumn);
  const whereSql = canonical.activeWhere
    ? ` AND ${qualifyActiveWhereClause(canonical.activeWhere, '')}`
    : '';
  const rows = await prisma.$queryRawUnsafe<Array<{ value: null | string }>>(
    `SELECT ${nameColumn} AS value
     FROM ${table}
     WHERE ${idColumn} = ?${whereSql}
     LIMIT 1`,
    id,
  );
  const value = normalizeValue(rows[0]?.value);
  return value || null;
}

async function readCanonicalNamesByIds(
  canonical: MasterDataCanonicalRelation,
  ids: string[],
) {
  const normalizedIds = [
    ...new Set(ids.map((item) => normalizeValue(item)).filter(Boolean)),
  ];
  const resolvedMap = new Map<string, null | string>();
  if (normalizedIds.length === 0) {
    return resolvedMap;
  }
  const table = quoteIdentifier(canonical.table);
  const idColumn = quoteIdentifier(canonical.idColumn);
  const nameColumn = quoteIdentifier(canonical.nameColumn);
  const placeholders = normalizedIds.map(() => '?').join(', ');
  const whereSql = canonical.activeWhere
    ? ` AND ${qualifyActiveWhereClause(canonical.activeWhere, '')}`
    : '';
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; name: null | string }>
  >(
    `SELECT ${idColumn} AS id, ${nameColumn} AS name
     FROM ${table}
     WHERE ${idColumn} IN (${placeholders})${whereSql}`,
    ...normalizedIds,
  );
  const hitMap = new Map(
    rows.map((row) => [
      normalizeValue(row.id),
      normalizeValue(row.name) || null,
    ]),
  );
  for (const id of normalizedIds) {
    resolvedMap.set(id, hitMap.get(id) ?? null);
  }
  return resolvedMap;
}

async function resolveCanonicalIdByName(
  canonical: MasterDataCanonicalRelation,
  name: string,
) {
  const table = quoteIdentifier(canonical.table);
  const idColumn = quoteIdentifier(canonical.idColumn);
  const nameColumn = quoteIdentifier(canonical.nameColumn);
  const whereSql = canonical.activeWhere
    ? ` AND ${qualifyActiveWhereClause(canonical.activeWhere, '')}`
    : '';
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT ${idColumn} AS id
     FROM ${table}
     WHERE ${nameColumn} = ?${whereSql}
     LIMIT 1`,
    name,
  );
  const id = normalizeValue(rows[0]?.id);
  return id || null;
}

async function seedCanonicalByNames(
  canonical: MasterDataCanonicalRelation,
  names: string[],
) {
  if (
    canonical.table === 'master_projects' ||
    canonical.table === 'master_parts'
  ) {
    const table = quoteIdentifier(canonical.table);
    const nameColumn = quoteIdentifier(canonical.nameColumn);
    for (const [sort, name] of names.entries()) {
      await prisma.$executeRawUnsafe(
        `INSERT IGNORE INTO ${table} (
         id, ${nameColumn}, sort, status, isDeleted, createdAt, updatedAt
       ) VALUES (?, ?, ?, 1, 0, NOW(3), NOW(3))`,
        randomUUID(),
        name,
        sort,
      );
    }
    return;
  }

  if (canonical.table === 'processes') {
    for (const [sort, name] of names.entries()) {
      await prisma.$executeRawUnsafe(
        `INSERT IGNORE INTO processes (
         id, name, code, sort, status, isDeleted, createdAt, updatedAt
       ) VALUES (?, ?, NULL, ?, 1, 0, NOW(3), NOW(3))`,
        randomUUID(),
        name,
        sort,
      );
    }
    return;
  }

  if (canonical.table !== 'dictionaries') {
    return;
  }

  const field = listMasterDataGovernanceFields().find(
    (item) =>
      item.canonical?.table === canonical.table &&
      item.canonical?.idColumn === canonical.idColumn &&
      item.canonical?.nameColumn === canonical.nameColumn &&
      item.source.type === 'dictionary',
  );
  if (!field || field.source.type !== 'dictionary') {
    return;
  }

  for (const [sort, name] of names.entries()) {
    await prisma.$executeRawUnsafe(
      `INSERT IGNORE INTO dictionaries (
         id, dictType, dictKey, dictValue, sort, status, isDeleted, createdAt, updatedAt
       ) VALUES (?, ?, ?, ?, ?, 1, 0, NOW(3), NOW(3))`,
      randomUUID(),
      field.source.dictType,
      name,
      name,
      sort,
    );
  }
}

async function readDistinctTargetNames(target: MasterDataTarget) {
  const tableName = quoteIdentifier(target.table);
  const nameColumn = quoteIdentifier(target.nameColumn);
  const rows = await prisma.$queryRawUnsafe<Array<{ value: null | string }>>(
    `SELECT DISTINCT ${nameColumn} AS value
     FROM ${tableName}
     WHERE ${nameColumn} IS NOT NULL AND TRIM(${nameColumn}) <> ''`,
  );
  const valueSet = new Set<string>();
  for (const row of rows) {
    const value = normalizeValue(row.value);
    if (value) {
      valueSet.add(value);
    }
  }
  return [...valueSet];
}

async function backfillTargetCanonicalIds(
  target: MasterDataTarget,
  resolvedIdMap: Map<string, string>,
  options: {
    batchSize: number;
    maxBatches?: number;
    maxRows?: number;
    startAfterId?: null | string;
  },
) {
  if (!target.idColumn) {
    return {
      batches: 0,
      exhausted: true,
      lastScannedId: null,
      nextStartAfterId: null,
      scannedRows: 0,
      unresolvedRows: 0,
      updatedRows: 0,
    } satisfies BackfillTableProgress;
  }

  const tableName = quoteIdentifier(target.table);
  const primaryKeyColumn = await getSinglePrimaryKeyColumn(target.table);
  if (!primaryKeyColumn) {
    throw new Error(`UNSUPPORTED_PRIMARY_KEY:${target.table}`);
  }
  const rowKeyColumn = quoteIdentifier(primaryKeyColumn);
  const nameColumn = quoteIdentifier(target.nameColumn);
  const canonicalIdColumn = quoteIdentifier(target.idColumn);
  const batchSize = Math.max(1, Number(options.batchSize || 1000));
  const maxRows = Math.max(0, Number(options.maxRows || 0));
  const maxBatches = Math.max(0, Number(options.maxBatches || 0));
  let cursor = normalizeValue(options.startAfterId) || null;
  let scannedRows = 0;
  let unresolvedRows = 0;
  let updatedRows = 0;
  let batches = 0;
  let exhausted = false;

  while (true) {
    if (maxBatches > 0 && batches >= maxBatches) {
      break;
    }
    if (maxRows > 0 && scannedRows >= maxRows) {
      break;
    }
    const remainingRows =
      maxRows > 0 ? Math.max(0, maxRows - scannedRows) : batchSize;
    const limit = Math.max(1, Math.min(batchSize, remainingRows));
    const rows = await prisma.$queryRawUnsafe<
      Array<{ rowKey: string; value: string }>
    >(
      `SELECT ${rowKeyColumn} AS rowKey, ${nameColumn} AS value
       FROM ${tableName}
       WHERE ${canonicalIdColumn} IS NULL
         AND ${nameColumn} IS NOT NULL
         AND TRIM(${nameColumn}) <> ''
         AND (? IS NULL OR ${rowKeyColumn} > ?)
       ORDER BY ${rowKeyColumn} ASC
       LIMIT ?`,
      cursor,
      cursor,
      limit,
    );
    if (rows.length === 0) {
      exhausted = true;
      break;
    }
    batches += 1;
    scannedRows += rows.length;
    cursor = normalizeValue(rows[rows.length - 1]?.rowKey) || cursor;

    const pairs = rows
      .map((row) => ({
        rowKey: row.rowKey,
        canonicalId: resolvedIdMap.get(normalizeValue(row.value)) || null,
      }))
      .filter((row): row is { canonicalId: string; rowKey: string } =>
        Boolean(row.canonicalId),
      );

    if (pairs.length === 0) {
      unresolvedRows += rows.length;
      if (rows.length < limit) {
        exhausted = true;
        break;
      }
      continue;
    }

    const caseWhenSql = pairs.map(() => 'WHEN ? THEN ?').join(' ');
    const placeholders = pairs.map(() => '?').join(', ');
    const params: string[] = [];
    for (const item of pairs) {
      params.push(item.rowKey, item.canonicalId);
    }
    for (const item of pairs) {
      params.push(item.rowKey);
    }

    const affectedRows = await prisma.$executeRawUnsafe(
      `UPDATE ${tableName}
       SET ${canonicalIdColumn} = CASE ${rowKeyColumn} ${caseWhenSql} ELSE ${canonicalIdColumn} END
       WHERE ${rowKeyColumn} IN (${placeholders})`,
      ...params,
    );
    updatedRows += toAffectedRows(affectedRows);
    if (rows.length < limit) {
      exhausted = true;
      break;
    }
  }

  return {
    batches,
    exhausted,
    scannedRows,
    unresolvedRows,
    updatedRows,
    lastScannedId: cursor,
    nextStartAfterId: exhausted ? null : cursor,
  } satisfies BackfillTableProgress;
}

export const __masterDataGovernanceTestHooks = {
  backfillTargetCanonicalIds,
  buildActiveRowWhereSql,
  resetCaches() {
    TABLE_COLUMN_CACHE.clear();
    TABLE_PRIMARY_KEY_CACHE.clear();
  },
};

export const MasterDataGovernanceKernel = {
  isConfigKey(configKey: string) {
    return Boolean(getMasterDataGovernanceField(configKey));
  },

  getField(configKey: string) {
    return getFieldOrThrow(configKey);
  },

  async rename(request: {
    configKey: string;
    dryRun?: boolean;
    newValue: string;
    oldValue: string;
  }): Promise<MasterDataRenameResult[]> {
    const field = getFieldOrThrow(request.configKey);
    const oldValue = normalizeValue(request.oldValue);
    const newValue = normalizeValue(request.newValue);
    const dryRun = Boolean(request.dryRun);

    if (!oldValue) {
      throw new Error('VALIDATION:oldValue 不能为空');
    }
    if (!newValue) {
      throw new Error('VALIDATION:newValue 不能为空');
    }
    if (oldValue === newValue) {
      throw new Error('VALIDATION:oldValue 与 newValue 不能相同');
    }

    return prisma.$transaction(async (tx) => {
      const results: MasterDataRenameResult[] = [];

      for (const target of field.targets) {
        if (dryRun) {
          const count = await queryExactMatchCount(
            tx,
            target.table,
            target.nameColumn,
            oldValue,
          );
          results.push({
            model: target.table,
            field: target.nameColumn,
            affectedRows: count,
          });
          continue;
        }

        const modelName = quoteIdentifier(target.table);
        const fieldName = quoteIdentifier(target.nameColumn);
        const affectedRows = await tx.$executeRawUnsafe(
          `UPDATE ${modelName} SET ${fieldName} = ? WHERE ${fieldName} = ?`,
          newValue,
          oldValue,
        );
        results.push({
          model: target.table,
          field: target.nameColumn,
          affectedRows: toAffectedRows(affectedRows),
        });
      }

      if (field.source.type === 'dictionary') {
        results.push(
          await renameDictionaryRows(
            tx,
            field.source.dictType,
            oldValue,
            newValue,
            dryRun,
          ),
        );
      }

      results.push(
        ...(await maybeRenameSourceEntity(
          tx,
          field.key,
          oldValue,
          newValue,
          dryRun,
        )),
      );

      return results;
    });
  },

  async auditOrphans(): Promise<MasterDataOrphanItem[]> {
    const orphanMap = new Map<
      string,
      { configKey: string; count: number; tables: Set<string>; value: string }
    >();

    const fields = listMasterDataGovernanceFields();

    for (const field of fields) {
      const sourceValues = await fetchSourceValues(field);

      for (const target of field.targets) {
        const tableName = quoteIdentifier(target.table);
        const nameColumn = quoteIdentifier(target.nameColumn);
        const activeRowWhere = await buildActiveRowWhereSql(target.table);
        const rows = await prisma.$queryRawUnsafe<ValueCountRow[]>(
          `SELECT ${nameColumn} AS value, COUNT(1) AS count
           FROM ${tableName}
           WHERE ${activeRowWhere}
             AND ${nameColumn} IS NOT NULL
             AND TRIM(${nameColumn}) <> ''
           GROUP BY ${nameColumn}`,
        );

        for (const row of rows) {
          const value = normalizeValue(row.value);
          if (!value || sourceValues.has(value)) {
            continue;
          }
          const mapKey = `${field.key}::${value}`;
          const existing = orphanMap.get(mapKey);
          if (existing) {
            existing.count += toAffectedRows(row.count);
            existing.tables.add(target.table);
            continue;
          }
          orphanMap.set(mapKey, {
            configKey: field.key,
            value,
            tables: new Set([target.table]),
            count: toAffectedRows(row.count),
          });
        }
      }
    }

    return [...orphanMap.values()]
      .map((item) => ({
        configKey: item.configKey,
        value: item.value,
        tables: [...item.tables].sort(),
        count: item.count,
      }))
      .sort((a, b) => {
        if (a.configKey !== b.configKey) {
          return a.configKey.localeCompare(b.configKey);
        }
        if (a.count !== b.count) {
          return b.count - a.count;
        }
        return a.value.localeCompare(b.value);
      });
  },

  async resolveCanonicalIdForWrite(options: {
    configKey: string;
    explicitCanonicalId?: null | string;
    fallbackCanonicalId?: null | string;
    keepExistingWhenNameMissing?: boolean;
    name?: null | string;
  }): Promise<null | string | undefined> {
    const field = getFieldOrThrow(options.configKey);
    const explicitCanonicalId = options.explicitCanonicalId;
    if (explicitCanonicalId !== undefined) {
      return explicitCanonicalId;
    }
    const normalizedName = normalizeValue(options.name);
    if (!normalizedName) {
      if (options.keepExistingWhenNameMissing) {
        return undefined;
      }
      return options.fallbackCanonicalId ?? null;
    }
    if (!field.canonical) {
      return options.fallbackCanonicalId ?? null;
    }
    return resolveCanonicalIdByName(field.canonical, normalizedName);
  },

  async resolveCanonicalNameById(options: {
    canonicalId?: null | string;
    configKey: string;
    fallbackName?: null | string;
  }) {
    const field = getFieldOrThrow(options.configKey);
    const normalizedId = normalizeValue(options.canonicalId);
    const fallbackName = normalizeValue(options.fallbackName);
    if (!normalizedId || !field.canonical) {
      return fallbackName || null;
    }
    const canonicalName = await readCanonicalNameById(
      field.canonical,
      normalizedId,
    );
    if (canonicalName) {
      return canonicalName;
    }
    return fallbackName || null;
  },

  async resolveCanonicalIdsByNames(options: {
    configKey: string;
    names: Array<null | string | undefined>;
  }) {
    const field = getFieldOrThrow(options.configKey);
    const resolvedMap = new Map<string, null | string>();
    const canonical = field.canonical;
    const normalizedNames = [
      ...new Set(
        options.names.map((item) => normalizeValue(item)).filter(Boolean),
      ),
    ];
    if (!canonical || normalizedNames.length === 0) {
      return resolvedMap;
    }
    const table = quoteIdentifier(canonical.table);
    const idColumn = quoteIdentifier(canonical.idColumn);
    const nameColumn = quoteIdentifier(canonical.nameColumn);
    const placeholders = normalizedNames.map(() => '?').join(', ');
    const whereSql = canonical.activeWhere
      ? ` AND ${qualifyActiveWhereClause(canonical.activeWhere, '')}`
      : '';
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; name: string }>
    >(
      `SELECT ${idColumn} AS id, ${nameColumn} AS name
       FROM ${table}
       WHERE ${nameColumn} IN (${placeholders})${whereSql}`,
      ...normalizedNames,
    );
    const hitMap = new Map(
      rows.map((row) => [normalizeValue(row.name), row.id]),
    );
    for (const name of normalizedNames) {
      resolvedMap.set(name, hitMap.get(name) || null);
    }
    return resolvedMap;
  },

  async resolveCanonicalNamesByIds(options: {
    canonicalIds: Array<null | string | undefined>;
    configKey: string;
    fallbackNameById?:
      | Map<string, null | string | undefined>
      | Record<string, null | string | undefined>;
  }) {
    const field = getFieldOrThrow(options.configKey);
    const resolvedMap = new Map<string, null | string>();
    const normalizedIds = [
      ...new Set(
        options.canonicalIds
          .map((item) => normalizeValue(item))
          .filter(Boolean),
      ),
    ];
    if (normalizedIds.length === 0) {
      return resolvedMap;
    }
    const fallbackMap =
      options.fallbackNameById instanceof Map
        ? options.fallbackNameById
        : new Map(Object.entries(options.fallbackNameById || {}));
    if (!field.canonical) {
      for (const id of normalizedIds) {
        resolvedMap.set(id, normalizeValue(fallbackMap.get(id)) || null);
      }
      return resolvedMap;
    }
    const canonicalMap = await readCanonicalNamesByIds(
      field.canonical,
      normalizedIds,
    );
    for (const id of normalizedIds) {
      resolvedMap.set(
        id,
        canonicalMap.get(id) || normalizeValue(fallbackMap.get(id)) || null,
      );
    }
    return resolvedMap;
  },

  async buildNameWhere(options: {
    canonicalIdField?: string;
    configKey: string;
    field?: string;
    name: string;
  }) {
    const normalizedName = normalizeValue(options.name);
    if (!normalizedName) {
      return {};
    }
    const field = String(options.field || '').trim() || 'processName';
    const resolvedCanonicalId = await this.resolveCanonicalIdForWrite({
      configKey: options.configKey,
      name: normalizedName,
    });
    const fieldCondition = { [field]: normalizedName } as Record<
      string,
      string
    >;
    if (!resolvedCanonicalId) {
      return fieldCondition;
    }
    const fieldDef = getFieldOrThrow(options.configKey);
    const firstCanonicalField =
      options.canonicalIdField ||
      fieldDef.targets.find((item) => item.idColumn)?.idColumn ||
      'processId';
    return {
      OR: [fieldCondition, { [firstCanonicalField]: resolvedCanonicalId }],
    };
  },

  async backfillCanonicalIds(options: {
    batchSize?: number;
    configKey: string;
    maxBatchesPerTable?: number;
    maxRowsPerTable?: number;
    seedCanonicalFromSource?: boolean;
    startAfterIdsByTable?: Record<string, null | string | undefined>;
  }) {
    const field = getFieldOrThrow(options.configKey);
    if (!field.canonical) {
      return {
        progressByTable: {},
        updatedByTable: {},
        seededCanonicalRows: 0,
      };
    }
    const batchSize = Math.max(100, Number(options.batchSize || 1000));
    const names = new Set<string>();
    for (const target of field.targets) {
      if (!target.idColumn) continue;
      const values = await readDistinctTargetNames(target);
      for (const value of values) {
        names.add(value);
      }
    }
    let seededCanonicalRows = 0;
    if (options.seedCanonicalFromSource) {
      const sourceValues = await fetchSourceValues(field);
      for (const value of sourceValues) {
        names.add(value);
      }
      seededCanonicalRows = sourceValues.size;
      await seedCanonicalByNames(
        field.canonical,
        [...sourceValues].sort((a, b) => a.localeCompare(b, 'zh-CN')),
      );
    }

    const resolvedIdMap = new Map<string, string>();
    const resolved = await this.resolveCanonicalIdsByNames({
      configKey: options.configKey,
      names: [...names],
    });
    for (const [name, id] of resolved.entries()) {
      if (id) {
        resolvedIdMap.set(name, id);
      }
    }

    const updatedByTable: Record<string, number> = {};
    const progressByTable: Record<string, BackfillTableProgress> = {};
    for (const target of field.targets) {
      if (!target.idColumn) continue;
      const progress = await backfillTargetCanonicalIds(target, resolvedIdMap, {
        batchSize,
        maxBatches: options.maxBatchesPerTable,
        maxRows: options.maxRowsPerTable,
        startAfterId: options.startAfterIdsByTable?.[target.table],
      });
      updatedByTable[target.table] = progress.updatedRows;
      progressByTable[target.table] = progress;
    }
    return {
      progressByTable,
      updatedByTable,
      seededCanonicalRows,
    };
  },

  async auditMissingCanonicalIds(configKey: string) {
    const field = getFieldOrThrow(configKey);
    if (!field.canonical) {
      return [] as MissingCanonicalIdItem[];
    }
    const results: MissingCanonicalIdItem[] = [];
    for (const target of field.targets) {
      if (!target.idColumn) continue;
      const tableName = quoteIdentifier(target.table);
      const nameColumn = quoteIdentifier(target.nameColumn);
      const idColumn = quoteIdentifier(target.idColumn);
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          missingCanonicalId: bigint | number | string;
          totalWithName: bigint | number | string;
        }>
      >(
        `SELECT
           SUM(CASE
             WHEN ${nameColumn} IS NOT NULL AND TRIM(${nameColumn}) <> '' THEN 1
             ELSE 0
           END) AS totalWithName,
           SUM(CASE
             WHEN ${nameColumn} IS NOT NULL AND TRIM(${nameColumn}) <> '' AND ${idColumn} IS NULL THEN 1
             ELSE 0
           END) AS missingCanonicalId
         FROM ${tableName}`,
      );
      const row = rows[0];
      results.push({
        table: target.table,
        totalWithName: toAffectedRows(row?.totalWithName),
        missingCanonicalId: toAffectedRows(row?.missingCanonicalId),
      });
    }
    return results;
  },

  async auditInvalidCanonicalIds(configKey: string) {
    const field = getFieldOrThrow(configKey);
    if (!field.canonical) {
      return [] as Array<{ invalidCanonicalId: number; table: string }>;
    }
    const canonicalTable = quoteIdentifier(field.canonical.table);
    const canonicalIdColumn = quoteIdentifier(field.canonical.idColumn);
    const canonicalActiveWhere = field.canonical.activeWhere
      ? ` AND ${qualifyActiveWhereClause(field.canonical.activeWhere, 'c')}`
      : '';

    const results: Array<{ invalidCanonicalId: number; table: string }> = [];
    for (const target of field.targets) {
      if (!target.idColumn) continue;
      const tableName = quoteIdentifier(target.table);
      const idColumn = quoteIdentifier(target.idColumn);
      const rows = await prisma.$queryRawUnsafe<
        Array<{ invalidCanonicalId: bigint | number | string }>
      >(
        `SELECT COUNT(1) AS invalidCanonicalId
         FROM ${tableName} t
         LEFT JOIN ${canonicalTable} c
           ON t.${idColumn} = c.${canonicalIdColumn}${canonicalActiveWhere}
         WHERE t.${idColumn} IS NOT NULL
           AND c.${canonicalIdColumn} IS NULL`,
      );
      results.push({
        table: target.table,
        invalidCanonicalId: toAffectedRows(rows[0]?.invalidCanonicalId),
      });
    }
    return results;
  },

  async seedCanonicalFromSource(configKey: string) {
    const field = getFieldOrThrow(configKey);
    if (!field.canonical) {
      return { seededCanonicalRows: 0 };
    }
    const sourceValues = await fetchSourceValues(field);
    const values = [...sourceValues].sort((a, b) =>
      a.localeCompare(b, 'zh-CN'),
    );
    await seedCanonicalByNames(field.canonical, values);
    return {
      seededCanonicalRows: values.length,
    };
  },

  async runFieldGovernance(options: {
    backfillBatchSize?: number;
    backfillMaxBatchesPerTable?: number;
    backfillMaxRowsPerTable?: number;
    backfillStartAfterIdsByTable?: Record<string, null | string | undefined>;
    configKey: string;
    failOnAuditError?: boolean;
    runAudit?: boolean;
    runBackfill?: boolean;
    runSeed?: boolean;
  }) {
    const field = getFieldOrThrow(options.configKey);
    const runSeed =
      options.runSeed === undefined
        ? Boolean(field.canonical)
        : options.runSeed;
    const runBackfill =
      options.runBackfill === undefined
        ? field.backfillPolicy === 'canonical-id'
        : options.runBackfill;
    const runAudit = options.runAudit ?? true;
    const failOnAuditError = options.failOnAuditError ?? true;

    const result: GovernanceFieldRunResult = {
      fieldKey: field.key,
      audit: {
        orphanCount: 0,
        status: 'pass',
      },
    };

    if (runSeed && field.canonical) {
      result.seed = await this.seedCanonicalFromSource(field.key);
    }
    if (runBackfill && field.canonical) {
      result.backfill = await this.backfillCanonicalIds({
        batchSize: options.backfillBatchSize,
        configKey: field.key,
        maxBatchesPerTable: options.backfillMaxBatchesPerTable,
        maxRowsPerTable: options.backfillMaxRowsPerTable,
        seedCanonicalFromSource: false,
        startAfterIdsByTable: options.backfillStartAfterIdsByTable,
      });
    }

    if (runAudit) {
      const orphans = await this.auditOrphans();
      const fieldOrphans = orphans.filter(
        (item) => item.configKey === field.key,
      );
      const orphanCount = fieldOrphans.reduce(
        (sum, item) => sum + item.count,
        0,
      );
      result.audit.orphanCount = orphanCount;

      let missingCanonicalId = 0;
      let invalidCanonicalId = 0;
      if (field.canonical) {
        const missingRows = await this.auditMissingCanonicalIds(field.key);
        const invalidRows = await this.auditInvalidCanonicalIds(field.key);
        missingCanonicalId = missingRows.reduce(
          (sum, item) => sum + item.missingCanonicalId,
          0,
        );
        invalidCanonicalId = invalidRows.reduce(
          (sum, item) => sum + item.invalidCanonicalId,
          0,
        );
        result.audit.missingCanonicalId = missingCanonicalId;
        result.audit.invalidCanonicalId = invalidCanonicalId;
      }
      const hasAuditError =
        orphanCount > 0 || missingCanonicalId > 0 || invalidCanonicalId > 0;
      result.audit.status = hasAuditError ? 'warn' : 'pass';
      if (hasAuditError && failOnAuditError) {
        throw new Error(
          `AUDIT_FAILED:${field.key}:orphan=${orphanCount},missing=${missingCanonicalId},invalid=${invalidCanonicalId}`,
        );
      }
    }

    return result;
  },

  async runGovernanceByFields(options: {
    backfillBatchSize?: number;
    backfillMaxBatchesPerTable?: number;
    backfillMaxRowsPerTable?: number;
    backfillStartAfterIdsByTable?: Record<string, null | string | undefined>;
    configKeys?: string[];
    failOnAuditError?: boolean;
    runAudit?: boolean;
    runBackfill?: boolean;
    runSeed?: boolean;
  }) {
    const keys =
      options.configKeys && options.configKeys.length > 0
        ? options.configKeys
        : listMasterDataGovernanceFields().map((field) => field.key);
    const results: GovernanceFieldRunResult[] = [];
    for (const key of keys) {
      const result = await this.runFieldGovernance({
        backfillBatchSize: options.backfillBatchSize,
        backfillMaxBatchesPerTable: options.backfillMaxBatchesPerTable,
        backfillMaxRowsPerTable: options.backfillMaxRowsPerTable,
        backfillStartAfterIdsByTable: options.backfillStartAfterIdsByTable,
        configKey: key,
        failOnAuditError: options.failOnAuditError,
        runAudit: options.runAudit,
        runBackfill: options.runBackfill,
        runSeed: options.runSeed,
      });
      results.push(result);
    }
    return results;
  },
};
