import type { MasterDataTarget } from '~/utils/master-data-fields';

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { listMasterDataGovernanceFields } from '~/utils/master-data-fields';
import prisma from '~/utils/prisma';

const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 1000;

export interface IdentityBaselineClient {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
}

type TargetDescriptor = MasterDataTarget & { configKey: string };
type ColumnRow = { columnName: string };
type BaselineRow = {
  entityId: string;
  isDeleted: boolean | null | number | string;
  rawId: null | string;
  rawName: null | string;
};

export interface IdentityBaselineField {
  checksum: string;
  configKey: string;
  deleted: number;
  fieldName: string;
  missingId: number;
  records: number;
  table: string;
  withId: number;
  withName: number;
}

export interface IdentityBaseline {
  contentChecksum: string;
  fields: IdentityBaselineField[];
  generatedAt: string;
  pageSize: number;
  version: 1;
}

function normalize(value: unknown) {
  return String(value || '').trim();
}

function quoteIdentifier(value: string) {
  if (!/^[_a-z]\w*$/i.test(value)) {
    throw new Error(`UNSAFE_IDENTIFIER:${value}`);
  }
  return `\`${value}\``;
}

function normalizePageSize(value: number | undefined) {
  const parsed = Number(value ?? DEFAULT_PAGE_SIZE);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error('pageSize must be a positive integer');
  }
  return Math.min(parsed, MAX_PAGE_SIZE);
}

function getTargetDescriptors() {
  return listMasterDataGovernanceFields()
    .flatMap((field) =>
      field.targets
        .filter((target): target is MasterDataTarget & { idColumn: string } =>
          Boolean(target.idColumn),
        )
        .map((target) => ({ ...target, configKey: field.key })),
    )
    .sort(
      (left, right) =>
        left.table.localeCompare(right.table) ||
        left.idColumn.localeCompare(right.idColumn) ||
        left.configKey.localeCompare(right.configKey),
    );
}

async function readPrimaryKey(client: IdentityBaselineClient, table: string) {
  const rows = await client.$queryRawUnsafe<ColumnRow[]>(
    `SELECT COLUMN_NAME AS columnName
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = 'PRIMARY'
     ORDER BY ORDINAL_POSITION ASC`,
    table,
  );
  const columns = rows.map((row) => normalize(row.columnName)).filter(Boolean);
  if (columns.length !== 1) {
    throw new Error(`UNSUPPORTED_PRIMARY_KEY:${table}`);
  }
  return columns[0] || '';
}

async function hasSoftDeleteColumn(
  client: IdentityBaselineClient,
  table: string,
) {
  const rows = await client.$queryRawUnsafe<ColumnRow[]>(
    `SELECT COLUMN_NAME AS columnName
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = 'isDeleted'`,
    table,
  );
  return rows.some((row) => normalize(row.columnName) === 'isDeleted');
}

async function scanTarget(
  client: IdentityBaselineClient,
  target: TargetDescriptor,
  pageSize: number,
) {
  const table = quoteIdentifier(target.table);
  const primaryKey = quoteIdentifier(
    await readPrimaryKey(client, target.table),
  );
  const hasSoftDelete = await hasSoftDeleteColumn(client, target.table);
  const idColumn = quoteIdentifier(target.idColumn);
  const nameColumn = quoteIdentifier(target.nameColumn);
  const softDeleteColumn = hasSoftDelete ? '`isDeleted`' : '0';
  const checksum = createHash('sha256');
  let cursor = '';
  let deleted = 0;
  let missingId = 0;
  let records = 0;
  let withId = 0;
  let withName = 0;

  while (true) {
    const rows = await client.$queryRawUnsafe<BaselineRow[]>(
      `SELECT ${primaryKey} AS entityId,
              ${softDeleteColumn} AS isDeleted,
              ${idColumn} AS rawId,
              ${nameColumn} AS rawName
       FROM ${table}
       WHERE ${primaryKey} > ?
       ORDER BY ${primaryKey} ASC
       LIMIT ?`,
      cursor,
      pageSize,
    );
    if (rows.length === 0) break;
    for (const row of rows) {
      const entityId = normalize(row.entityId);
      const rawId = normalize(row.rawId);
      const rawName = normalize(row.rawName);
      const isDeleted =
        row.isDeleted === true || Number(normalize(row.isDeleted)) === 1;
      records += 1;
      if (isDeleted) deleted += 1;
      if (rawId) withId += 1;
      if (rawName) withName += 1;
      if (!isDeleted && rawName && !rawId) missingId += 1;
      checksum.update(
        JSON.stringify([entityId, isDeleted ? 1 : 0, rawId, rawName]),
      );
      checksum.update('\n');
    }
    cursor = normalize(rows.at(-1)?.entityId);
    if (!cursor || rows.length < pageSize) break;
  }

  return {
    checksum: checksum.digest('hex'),
    configKey: target.configKey,
    deleted,
    fieldName: target.idColumn,
    missingId,
    records,
    table: target.table,
    withId,
    withName,
  } satisfies IdentityBaselineField;
}

export async function generateIdentityBaseline(
  options: {
    client?: IdentityBaselineClient;
    generatedAt?: Date;
    pageSize?: number;
  } = {},
): Promise<IdentityBaseline> {
  const client = options.client || prisma;
  const pageSize = normalizePageSize(options.pageSize);
  const fields = [] as IdentityBaselineField[];
  for (const target of getTargetDescriptors()) {
    fields.push(await scanTarget(client, target, pageSize));
  }
  const content = { fields, pageSize, version: 1 as const };
  return {
    ...content,
    contentChecksum: createHash('sha256')
      .update(JSON.stringify(content))
      .digest('hex'),
    generatedAt: (options.generatedAt || new Date()).toISOString(),
  };
}

function parseOptions(args: string[]) {
  let output = '';
  let pageSize: number | undefined;
  for (const argument of args) {
    if (argument.startsWith('--output=')) {
      output = argument.slice('--output='.length);
    } else if (argument.startsWith('--page-size=')) {
      pageSize = Number(argument.slice('--page-size='.length));
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!output) throw new Error('The --output option is required');
  return { output: resolve(output), pageSize: normalizePageSize(pageSize) };
}

export async function runIdentityBaselineCli(
  args = process.argv.slice(2),
  options: {
    client?: IdentityBaselineClient;
    generatedAt?: Date;
  } = {},
) {
  const cliOptions = parseOptions(args);
  const baseline = await generateIdentityBaseline({
    client: options.client,
    generatedAt: options.generatedAt,
    pageSize: cliOptions.pageSize,
  });
  await mkdir(dirname(cliOptions.output), { recursive: true });
  await writeFile(
    cliOptions.output,
    `${JSON.stringify(baseline, null, 2)}\n`,
    'utf8',
  );
  return baseline;
}

export function isDirectExecution(
  scriptPath = process.argv[1],
  moduleUrl = import.meta.url,
  workingDirectory = process.cwd(),
) {
  return (
    Boolean(scriptPath) &&
    resolve(workingDirectory, scriptPath) === fileURLToPath(moduleUrl)
  );
}

if (isDirectExecution()) {
  void runIdentityBaselineCli();
}
