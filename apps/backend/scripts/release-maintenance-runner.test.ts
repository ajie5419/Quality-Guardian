import type { ReleaseMaintenanceTaskDefinition } from './release-maintenance-manifest';
import type {
  ReleaseMaintenanceLedger,
  ReleaseMaintenanceLedgerRecord,
} from './release-maintenance-runner';

import { describe, expect, it, vi } from 'vitest';

import {
  claimReleaseMaintenanceTask,
  ReleaseMaintenanceDefinitionDriftError,
  ReleaseMaintenanceTaskBusyError,
  runReleaseMaintenance,
} from './release-maintenance-runner';

function task(overrides: Partial<ReleaseMaintenanceTaskDefinition> = {}) {
  return {
    checksum: 'a'.repeat(64),
    introducedIn: '0.25.0',
    revision: 1,
    run: vi.fn().mockResolvedValue(undefined),
    taskKey: 'example-release-backfill',
    ...overrides,
  };
}

function record(
  overrides: Partial<ReleaseMaintenanceLedgerRecord> = {},
): ReleaseMaintenanceLedgerRecord {
  return {
    attempts: 1,
    checksum: 'a'.repeat(64),
    completedAt: null,
    id: 'ledger-1',
    leaseUntil: null,
    revision: 1,
    status: 'FAILED',
    taskKey: 'example-release-backfill',
    ...overrides,
  };
}

function logger() {
  return { error: vi.fn(), info: vi.fn() };
}

function ledgerWith(initial: null | ReleaseMaintenanceLedgerRecord) {
  let current = initial;
  const ledger: ReleaseMaintenanceLedger = {
    claim: vi.fn(async (input) => {
      if (!current || current.id !== input.id) return 0;
      if (
        current.status !== 'FAILED' &&
        (current.status !== 'RUNNING' ||
          !current.leaseUntil ||
          current.leaseUntil > input.now)
      ) {
        return 0;
      }
      current = {
        ...current,
        attempts: current.attempts + 1,
        leaseUntil: input.leaseUntil,
        status: 'RUNNING',
      };
      return 1;
    }),
    complete: vi.fn(async (input) => {
      if (!current || current.id !== input.id || current.status !== 'RUNNING') {
        return 0;
      }
      current = {
        ...current,
        completedAt: input.now,
        leaseUntil: null,
        status: 'COMPLETED',
      };
      return 1;
    }),
    create: vi.fn(async (input) => {
      if (current) {
        const error = Object.assign(new Error('duplicate'), { code: 'P2002' });
        throw error;
      }
      current = record({
        attempts: 1,
        checksum: input.checksum,
        leaseUntil: input.leaseUntil,
        revision: input.revision,
        status: 'RUNNING',
        taskKey: input.taskKey,
      });
      return current;
    }),
    fail: vi.fn(async (input) => {
      if (!current || current.id !== input.id || current.status !== 'RUNNING') {
        return 0;
      }
      current = { ...current, leaseUntil: null, status: 'FAILED' };
      return 1;
    }),
    find: vi.fn(async () => current),
  };
  return { ledger, current: () => current };
}

describe('versioned release maintenance', () => {
  it('runs a new task once and persists completion', async () => {
    const stored = ledgerWith(null);
    const releaseTask = task();
    const releaseLogger = logger();

    await runReleaseMaintenance({
      ledger: stored.ledger,
      logger: releaseLogger,
      tasks: [releaseTask],
    });

    expect(releaseTask.run).toHaveBeenCalledOnce();
    expect(stored.current()).toMatchObject({ status: 'COMPLETED' });
    expect(releaseLogger.info).toHaveBeenCalledWith(
      { revision: 1, taskKey: 'example-release-backfill' },
      'release maintenance task started',
    );
    expect(releaseLogger.info).toHaveBeenCalledWith(
      { revision: 1, taskKey: 'example-release-backfill' },
      'release maintenance task completed',
    );
  });

  it('skips a completed task with the same checksum', async () => {
    const stored = ledgerWith(record({ status: 'COMPLETED' }));
    const releaseTask = task();
    const releaseLogger = logger();

    await runReleaseMaintenance({
      ledger: stored.ledger,
      logger: releaseLogger,
      tasks: [releaseTask],
    });

    expect(releaseTask.run).not.toHaveBeenCalled();
    expect(releaseLogger.info).toHaveBeenCalledWith(
      { revision: 1, taskKey: 'example-release-backfill' },
      'release maintenance task skipped',
    );
  });

  it('records failure and retries the same revision on the next release', async () => {
    const stored = ledgerWith(null);
    const firstTask = task({
      run: vi.fn().mockRejectedValue(new Error('blocked')),
    });
    const releaseLogger = logger();

    await expect(
      runReleaseMaintenance({
        ledger: stored.ledger,
        logger: releaseLogger,
        tasks: [firstTask],
      }),
    ).rejects.toThrow('blocked');
    expect(stored.current()).toMatchObject({ status: 'FAILED' });

    const retryTask = task();
    await runReleaseMaintenance({
      ledger: stored.ledger,
      logger: releaseLogger,
      tasks: [retryTask],
    });
    expect(retryTask.run).toHaveBeenCalledOnce();
    expect(stored.current()).toMatchObject({
      attempts: 2,
      status: 'COMPLETED',
    });
  });

  it('allows only one concurrent claim and reclaims an expired lease', async () => {
    const now = new Date('2026-08-13T00:00:00.000Z');
    const stored = ledgerWith(null);
    const releaseTask = task();

    const [first, second] = await Promise.allSettled([
      claimReleaseMaintenanceTask({
        ledger: stored.ledger,
        now,
        task: releaseTask,
      }),
      claimReleaseMaintenanceTask({
        ledger: stored.ledger,
        now,
        task: releaseTask,
      }),
    ]);

    expect(
      [first, second].filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      [first, second].find((result) => result.status === 'rejected')?.reason,
    ).toBeInstanceOf(ReleaseMaintenanceTaskBusyError);

    const storedRunning = ledgerWith(
      record({
        leaseUntil: new Date('2026-08-13T00:14:59.999Z'),
        status: 'RUNNING',
      }),
    );
    await expect(
      claimReleaseMaintenanceTask({
        ledger: storedRunning.ledger,
        now,
        task: releaseTask,
      }),
    ).rejects.toBeInstanceOf(ReleaseMaintenanceTaskBusyError);

    const storedExpired = ledgerWith(
      record({
        leaseUntil: new Date('2026-08-12T23:59:59.999Z'),
        status: 'RUNNING',
      }),
    );
    await expect(
      claimReleaseMaintenanceTask({
        ledger: storedExpired.ledger,
        now,
        task: releaseTask,
      }),
    ).resolves.toMatchObject({ kind: 'acquired' });
  });

  it('fails closed when it cannot record a task failure', async () => {
    const stored = ledgerWith(null);
    vi.mocked(stored.ledger.fail).mockResolvedValue(0);

    await expect(
      runReleaseMaintenance({
        ledger: stored.ledger,
        logger: logger(),
        tasks: [task({ run: vi.fn().mockRejectedValue(new Error('blocked')) })],
      }),
    ).rejects.toThrow('ledger claim was lost');
  });

  it('rejects checksum drift for an existing revision', async () => {
    const stored = ledgerWith(record());

    await expect(
      claimReleaseMaintenanceTask({
        ledger: stored.ledger,
        task: task({ checksum: 'b'.repeat(64) }),
      }),
    ).rejects.toBeInstanceOf(ReleaseMaintenanceDefinitionDriftError);
  });
});
