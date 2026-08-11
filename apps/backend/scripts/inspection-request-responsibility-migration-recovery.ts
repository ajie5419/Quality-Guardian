import { spawn } from 'node:child_process';
import process from 'node:process';

import { Prisma, PrismaClient } from '@prisma/client';

const migrationName = '20260811000000_add_inspection_request_responsibility';
const requestTableName = 'qms_inspection_requests';
const canonicalIndexName = 'qms_inspection_requests_resp_dept_idx';

const expectedColumns = [
  'supplierName',
  'responsibilityType',
  'responsibleDepartmentId',
  'responsibleDepartment',
] as const;

const expectedIndexColumns = [
  'responsibilityType',
  'responsibleDepartmentId',
] as const;

type MigrationRow = {
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

type MigrationTableRow = {
  present: number;
};

type TableRow = {
  engine: string;
};

type ColumnRow = {
  column_default: null | string;
  column_name: string;
  column_type: string;
  is_nullable: string;
};

type IndexRow = {
  column_name: string;
  index_name: string;
  non_unique: bigint | number;
  seq_in_index: bigint | number;
};

export type MigrationRecoverySnapshot = {
  activeFailedMigrationCount: number;
  columns: ColumnRow[];
  indexes: IndexRow[];
  tableEngine: null | string;
};

export type MigrationRecoveryAction =
  | 'BLOCKED'
  | 'NOT_REQUIRED'
  | 'RESOLVE_APPLIED'
  | 'RESOLVE_ROLLED_BACK';

export type CommandRunner = (command: string, args: string[]) => Promise<void>;

type RawQueryClient = Pick<PrismaClient, '$queryRaw'>;

function isExpectedColumn(column: ColumnRow): boolean {
  return (
    expectedColumns.includes(
      column.column_name as (typeof expectedColumns)[number],
    ) &&
    column.column_type.toLowerCase() === 'varchar(191)' &&
    column.is_nullable.toUpperCase() === 'YES' &&
    column.column_default === null
  );
}

function hasCompleteColumns(columns: ColumnRow[]): boolean {
  return (
    columns.length === expectedColumns.length &&
    expectedColumns.every((name) =>
      columns.some(
        (column) => column.column_name === name && isExpectedColumn(column),
      ),
    )
  );
}

function hasCompleteCanonicalIndex(indexes: IndexRow[]): boolean {
  const canonicalRows = indexes
    .filter((index) => index.index_name === canonicalIndexName)
    .sort(
      (left, right) => Number(left.seq_in_index) - Number(right.seq_in_index),
    );

  return (
    canonicalRows.length === expectedIndexColumns.length &&
    canonicalRows.every(
      (index, position) =>
        Number(index.non_unique) === 1 &&
        Number(index.seq_in_index) === position + 1 &&
        index.column_name === expectedIndexColumns[position],
    )
  );
}

function hasOnlyCanonicalIndex(indexes: IndexRow[]): boolean {
  return indexes.every((index) => index.index_name === canonicalIndexName);
}

/**
 * The failed migration was a single MySQL ALTER TABLE statement. We recover only
 * the two provable endpoint states and refuse any drift that could hide partial DDL.
 */
export function decideMigrationRecovery(
  snapshot: MigrationRecoverySnapshot,
): MigrationRecoveryAction {
  if (snapshot.activeFailedMigrationCount === 0) {
    return 'NOT_REQUIRED';
  }

  if (
    snapshot.activeFailedMigrationCount !== 1 ||
    snapshot.tableEngine !== 'InnoDB'
  ) {
    return 'BLOCKED';
  }

  if (snapshot.columns.length === 0 && snapshot.indexes.length === 0) {
    return 'RESOLVE_ROLLED_BACK';
  }

  if (
    hasCompleteColumns(snapshot.columns) &&
    hasCompleteCanonicalIndex(snapshot.indexes) &&
    hasOnlyCanonicalIndex(snapshot.indexes)
  ) {
    return 'RESOLVE_APPLIED';
  }

  return 'BLOCKED';
}

export async function readMigrationRecoverySnapshot(
  prisma: RawQueryClient,
): Promise<MigrationRecoverySnapshot> {
  const migrationTables = await prisma.$queryRaw<
    MigrationTableRow[]
  >(Prisma.sql`
    SELECT 1 AS present
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = ${'_prisma_migrations'}
  `);

  if (migrationTables.length === 0) {
    return {
      activeFailedMigrationCount: 0,
      tableEngine: null,
      columns: [],
      indexes: [],
    };
  }

  const migrationRows = await prisma.$queryRaw<MigrationRow[]>(Prisma.sql`
    SELECT finished_at, rolled_back_at
    FROM _prisma_migrations
    WHERE migration_name = ${migrationName}
      AND finished_at IS NULL
      AND rolled_back_at IS NULL
  `);

  if (migrationRows.length === 0) {
    return {
      activeFailedMigrationCount: 0,
      tableEngine: null,
      columns: [],
      indexes: [],
    };
  }

  const [tables, columns, indexes] = await Promise.all([
    prisma.$queryRaw<TableRow[]>(Prisma.sql`
      SELECT ENGINE AS engine
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = ${requestTableName}
    `),
    prisma.$queryRaw<ColumnRow[]>(Prisma.sql`
      SELECT column_name, column_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ${requestTableName}
        AND column_name IN (
          ${expectedColumns[0]},
          ${expectedColumns[1]},
          ${expectedColumns[2]},
          ${expectedColumns[3]}
        )
    `),
    prisma.$queryRaw<IndexRow[]>(Prisma.sql`
      SELECT index_name, non_unique, seq_in_index, column_name
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ${requestTableName}
        AND (
          index_name = ${canonicalIndexName}
          OR column_name IN (${expectedIndexColumns[0]}, ${expectedIndexColumns[1]})
        )
    `),
  ]);

  return {
    activeFailedMigrationCount: migrationRows.length,
    tableEngine: tables.length === 1 ? tables[0].engine : null,
    columns,
    indexes,
  };
}

export function createCommandRunner(
  spawnProcess: typeof spawn = spawn,
): CommandRunner {
  return async (command, args) =>
    new Promise<void>((resolve, reject) => {
      const child = spawnProcess(command, args, {
        stdio: 'ignore',
      });

      child.once('error', () => {
        reject(new Error('Prisma migration recovery command could not start.'));
      });
      child.once('exit', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error('Prisma migration recovery command failed.'));
      });
    });
}

export async function applyMigrationRecovery(
  action: MigrationRecoveryAction,
  runner: CommandRunner,
  options: { prismaBin: string; schemaPath: string },
): Promise<void> {
  if (action === 'NOT_REQUIRED') {
    return;
  }

  if (action === 'BLOCKED') {
    throw new Error(
      'Inspection request migration recovery is blocked by schema drift.',
    );
  }

  const resolution =
    action === 'RESOLVE_ROLLED_BACK' ? '--rolled-back' : '--applied';
  await runner(options.prismaBin, [
    'migrate',
    'resolve',
    '--schema',
    options.schemaPath,
    resolution,
    migrationName,
  ]);
}

function parseOptions(
  args: string[],
): null | { apply: boolean; prismaBin: string; schemaPath: string } {
  let apply = false;
  let prismaBin = '';
  let schemaPath = '';

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--apply') {
      apply = true;
      continue;
    }
    if (argument === '--prisma-bin') {
      prismaBin = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (argument === '--schema') {
      schemaPath = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    return null;
  }

  return prismaBin && schemaPath ? { apply, prismaBin, schemaPath } : null;
}

export async function main(
  args: string[],
  dependencies: {
    prisma?: PrismaClient;
    runner?: CommandRunner;
    writeStderr?: (message: string) => void;
    writeStdout?: (message: string) => void;
  } = {},
): Promise<number> {
  const options = parseOptions(args);
  const writeStdout =
    dependencies.writeStdout ?? ((message) => process.stdout.write(message));
  const writeStderr =
    dependencies.writeStderr ?? ((message) => process.stderr.write(message));
  if (!options) {
    writeStderr(
      'Usage: migration recovery requires --prisma-bin <path> --schema <path>.\n',
    );
    return 2;
  }

  const prisma = dependencies.prisma ?? new PrismaClient();
  try {
    const action = decideMigrationRecovery(
      await readMigrationRecoverySnapshot(prisma),
    );
    if (action === 'BLOCKED') {
      writeStderr(
        'Inspection request migration recovery blocked: unexpected schema state.\n',
      );
      return 1;
    }

    if (options.apply) {
      await applyMigrationRecovery(
        action,
        dependencies.runner ?? createCommandRunner(),
        options,
      );
    }

    writeStdout(`Inspection request migration recovery: ${action}.\n`);
    return 0;
  } catch {
    writeStderr(
      'Inspection request migration recovery could not inspect or resolve the database state.\n',
    );
    return 1;
  } finally {
    if (!dependencies.prisma) {
      await prisma.$disconnect();
    }
  }
}

if (
  process.argv[1]?.endsWith(
    'inspection-request-responsibility-migration-recovery.ts',
  )
) {
  void main(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
