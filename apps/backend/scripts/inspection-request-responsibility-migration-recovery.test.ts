import type { MigrationRecoverySnapshot } from './inspection-request-responsibility-migration-recovery';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { describe, expect, it, vi } from 'vitest';

import {
  applyMigrationRecovery,
  createCommandRunner,
  decideMigrationRecovery,
  main,
} from './inspection-request-responsibility-migration-recovery';

const execFileAsync = promisify(execFile);

const noneSnapshot: MigrationRecoverySnapshot = {
  activeFailedMigrationCount: 1,
  tableEngine: 'InnoDB',
  columns: [],
  indexes: [],
};

const completeSnapshot: MigrationRecoverySnapshot = {
  activeFailedMigrationCount: 1,
  tableEngine: 'InnoDB',
  columns: [
    {
      column_name: 'supplierName',
      column_type: 'varchar(191)',
      is_nullable: 'YES',
      column_default: null,
    },
    {
      column_name: 'responsibilityType',
      column_type: 'varchar(191)',
      is_nullable: 'YES',
      column_default: null,
    },
    {
      column_name: 'responsibleDepartmentId',
      column_type: 'varchar(191)',
      is_nullable: 'YES',
      column_default: null,
    },
    {
      column_name: 'responsibleDepartment',
      column_type: 'varchar(191)',
      is_nullable: 'YES',
      column_default: null,
    },
  ],
  indexes: [
    {
      index_name: 'qms_inspection_requests_resp_dept_idx',
      non_unique: 1,
      seq_in_index: 1,
      column_name: 'responsibilityType',
    },
    {
      index_name: 'qms_inspection_requests_resp_dept_idx',
      non_unique: 1,
      seq_in_index: 2,
      column_name: 'responsibleDepartmentId',
    },
  ],
};

function createPrismaSnapshotMock(
  snapshot: MigrationRecoverySnapshot,
  hasMigrationTable = true,
) {
  return {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce(hasMigrationTable ? [{ present: 1 }] : [])
      .mockResolvedValueOnce(
        Array.from({ length: snapshot.activeFailedMigrationCount }, () => ({
          finished_at: null,
          rolled_back_at: null,
        })),
      )
      .mockResolvedValueOnce(
        snapshot.tableEngine ? [{ engine: snapshot.tableEngine }] : [],
      )
      .mockResolvedValueOnce(snapshot.columns)
      .mockResolvedValueOnce(snapshot.indexes),
  };
}

describe('inspection request responsibility migration recovery', () => {
  it('rolls the failed migration back only when no schema effects exist', () => {
    expect(decideMigrationRecovery(noneSnapshot)).toBe('RESOLVE_ROLLED_BACK');
  });

  it('marks the migration applied only when the full canonical schema exists', () => {
    expect(decideMigrationRecovery(completeSnapshot)).toBe('RESOLVE_APPLIED');
  });

  it('fails closed for partial columns, an unexpected engine, or an unexpected index', () => {
    expect(
      decideMigrationRecovery({
        ...noneSnapshot,
        columns: [completeSnapshot.columns[0]],
      }),
    ).toBe('BLOCKED');
    expect(
      decideMigrationRecovery({
        ...noneSnapshot,
        tableEngine: 'MyISAM',
      }),
    ).toBe('BLOCKED');
    expect(
      decideMigrationRecovery({
        ...completeSnapshot,
        indexes: [
          ...completeSnapshot.indexes,
          {
            index_name: 'manual_responsibility_index',
            non_unique: 1,
            seq_in_index: 1,
            column_name: 'responsibilityType',
          },
        ],
      }),
    ).toBe('BLOCKED');
  });

  it('does nothing when the named migration has no active failure', () => {
    expect(
      decideMigrationRecovery({
        ...noneSnapshot,
        activeFailedMigrationCount: 0,
      }),
    ).toBe('NOT_REQUIRED');
  });

  it('preserves the P3005 baseline path when the migrations table is absent', async () => {
    const runner = vi.fn().mockResolvedValue(undefined);
    const writeStdout = vi.fn();
    const prisma = createPrismaSnapshotMock(noneSnapshot, false);

    const exitCode = await main(
      [
        '--apply',
        '--prisma-bin',
        '/app/prisma',
        '--schema',
        '/app/schema.prisma',
      ],
      { prisma: prisma as never, runner, writeStdout },
    );

    expect(exitCode).toBe(0);
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(runner).not.toHaveBeenCalled();
    expect(writeStdout).toHaveBeenCalledWith(
      'Inspection request migration recovery: NOT_REQUIRED.\n',
    );
  });

  it('uses the official Prisma CLI resolve command with injected execution', async () => {
    const runner = vi.fn().mockResolvedValue(undefined);

    await applyMigrationRecovery('RESOLVE_ROLLED_BACK', runner, {
      prismaBin: '/app/prisma',
      schemaPath: '/app/schema.prisma',
    });
    await applyMigrationRecovery('RESOLVE_APPLIED', runner, {
      prismaBin: '/app/prisma',
      schemaPath: '/app/schema.prisma',
    });

    expect(runner).toHaveBeenNthCalledWith(1, '/app/prisma', [
      'migrate',
      'resolve',
      '--schema',
      '/app/schema.prisma',
      '--rolled-back',
      '20260811000000_add_inspection_request_responsibility',
    ]);
    expect(runner).toHaveBeenNthCalledWith(2, '/app/prisma', [
      'migrate',
      'resolve',
      '--schema',
      '/app/schema.prisma',
      '--applied',
      '20260811000000_add_inspection_request_responsibility',
    ]);
  });

  it('injects the process spawn implementation and keeps Prisma command output private', async () => {
    const child = {
      once: vi.fn((event: string, callback: (code: number) => void) => {
        if (event === 'exit') {
          queueMicrotask(() => callback(0));
        }
        return child;
      }),
    };
    const spawnProcess = vi.fn(() => {
      return child;
    });
    const runner = createCommandRunner(spawnProcess as never);

    await runner('/app/prisma', ['migrate', 'resolve']);

    expect(spawnProcess).toHaveBeenCalledWith(
      '/app/prisma',
      ['migrate', 'resolve'],
      {
        stdio: 'ignore',
      },
    );
  });

  it('applies the complete state through the main entrypoint', async () => {
    const runner = vi.fn().mockResolvedValue(undefined);
    const writeStdout = vi.fn();
    const writeStderr = vi.fn();
    const prisma = createPrismaSnapshotMock(completeSnapshot);

    const exitCode = await main(
      [
        '--apply',
        '--prisma-bin',
        '/app/prisma',
        '--schema',
        '/app/schema.prisma',
      ],
      { prisma: prisma as never, runner, writeStdout, writeStderr },
    );

    expect(exitCode).toBe(0);
    expect(writeStdout).toHaveBeenCalledWith(
      'Inspection request migration recovery: RESOLVE_APPLIED.\n',
    );
    expect(writeStderr).not.toHaveBeenCalled();
    expect(runner).toHaveBeenCalledOnce();
  });

  it('does not resolve an unexpected state through the main entrypoint', async () => {
    const runner = vi.fn().mockResolvedValue(undefined);
    const writeStderr = vi.fn();

    const exitCode = await main(
      [
        '--apply',
        '--prisma-bin',
        '/app/prisma',
        '--schema',
        '/app/schema.prisma',
      ],
      {
        prisma: createPrismaSnapshotMock({
          ...noneSnapshot,
          columns: [completeSnapshot.columns[0]],
        }) as never,
        runner,
        writeStderr,
      },
    );

    expect(exitCode).toBe(1);
    expect(runner).not.toHaveBeenCalled();
    expect(writeStderr).toHaveBeenCalledWith(
      'Inspection request migration recovery blocked: unexpected schema state.\n',
    );
  });

  it('runs under POSIX sh and invokes deploy after the recovery command succeeds', async () => {
    const { stdout } = await execFileAsync(
      'sh',
      ['scripts/run-prisma-migrations.sh'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PRISMA_BIN: '/bin/echo',
          PRISMA_SCHEMA: '/tmp/schema.prisma',
          TSX_BIN: '/bin/echo',
        },
      },
    );

    expect(stdout).toContain(
      'inspection-request-responsibility-migration-recovery.ts --apply --prisma-bin /bin/echo --schema /tmp/schema.prisma',
    );
    expect(stdout).toContain('migrate deploy --schema /tmp/schema.prisma');
  });
});
