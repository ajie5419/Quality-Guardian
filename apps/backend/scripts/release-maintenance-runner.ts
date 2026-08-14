import type { ReleaseMaintenanceTaskDefinition } from './release-maintenance-manifest';

import { createId } from '@paralleldrive/cuid2';

export type ReleaseMaintenanceTaskStatus = 'COMPLETED' | 'FAILED' | 'RUNNING';

export interface ReleaseMaintenanceLedgerRecord {
  attempts: number;
  checksum: string;
  completedAt: Date | null;
  id: string;
  leaseUntil: Date | null;
  revision: number;
  status: ReleaseMaintenanceTaskStatus;
  taskKey: string;
}

export interface ReleaseMaintenanceLedger {
  claim(input: {
    attemptToken: string;
    id: string;
    leaseUntil: Date;
    now: Date;
  }): Promise<number>;
  complete(input: {
    attemptToken: string;
    id: string;
    now: Date;
  }): Promise<number>;
  create(input: {
    attemptToken: string;
    checksum: string;
    leaseUntil: Date;
    now: Date;
    revision: number;
    taskKey: string;
  }): Promise<ReleaseMaintenanceLedgerRecord>;
  fail(input: {
    attemptToken: string;
    error: string;
    id: string;
    now: Date;
  }): Promise<number>;
  find(input: {
    revision: number;
    taskKey: string;
  }): Promise<null | ReleaseMaintenanceLedgerRecord>;
}

export interface ReleaseMaintenanceLogger {
  error: (payload: object, message: string) => void;
  info: (payload: object, message: string) => void;
}

export class ReleaseMaintenanceDefinitionDriftError extends Error {
  constructor(task: ReleaseMaintenanceTaskDefinition) {
    super(
      `Release maintenance task ${task.taskKey}@${task.revision} has a checksum drift. Create a new revision instead of changing a completed task.`,
    );
    this.name = 'ReleaseMaintenanceDefinitionDriftError';
  }
}

export class ReleaseMaintenanceTaskBusyError extends Error {
  constructor(task: ReleaseMaintenanceTaskDefinition) {
    super(
      `Release maintenance task ${task.taskKey}@${task.revision} is already running.`,
    );
    this.name = 'ReleaseMaintenanceTaskBusyError';
  }
}

// This exceeds the bounded release-maintenance command timeout, preventing a
// second deploy from reclaiming a legitimately slow task still in progress.
const DEFAULT_LEASE_MS = 15 * 60 * 1000;
const MAX_CLAIM_RETRIES = 3;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

function isRunning(record: ReleaseMaintenanceLedgerRecord, now: Date) {
  return (
    record.status === 'RUNNING' &&
    record.leaseUntil !== null &&
    record.leaseUntil > now
  );
}

type ClaimResult =
  | {
      attemptToken: string;
      kind: 'acquired';
      record: ReleaseMaintenanceLedgerRecord;
    }
  | { kind: 'completed'; record: ReleaseMaintenanceLedgerRecord };

/**
 * A lease makes an interrupted release retryable while atomic conditional
 * updates ensure concurrent deploys cannot execute the same task twice.
 */
export async function claimReleaseMaintenanceTask(input: {
  leaseMs?: number;
  ledger: ReleaseMaintenanceLedger;
  now?: Date;
  task: ReleaseMaintenanceTaskDefinition;
}): Promise<ClaimResult> {
  const now = input.now ?? new Date();
  const leaseUntil = new Date(
    now.getTime() + (input.leaseMs ?? DEFAULT_LEASE_MS),
  );

  for (let retry = 0; retry < MAX_CLAIM_RETRIES; retry += 1) {
    const current = await input.ledger.find({
      revision: input.task.revision,
      taskKey: input.task.taskKey,
    });
    if (!current) {
      const attemptToken = createId();
      try {
        const record = await input.ledger.create({
          attemptToken,
          checksum: input.task.checksum,
          leaseUntil,
          now,
          revision: input.task.revision,
          taskKey: input.task.taskKey,
        });
        return { attemptToken, kind: 'acquired', record };
      } catch (error: unknown) {
        if (isUniqueConstraintError(error)) continue;
        throw error;
      }
    }

    if (current.checksum !== input.task.checksum) {
      throw new ReleaseMaintenanceDefinitionDriftError(input.task);
    }
    if (current.status === 'COMPLETED') {
      return { kind: 'completed', record: current };
    }
    if (isRunning(current, now)) {
      throw new ReleaseMaintenanceTaskBusyError(input.task);
    }

    const attemptToken = createId();
    const claimed = await input.ledger.claim({
      attemptToken,
      id: current.id,
      leaseUntil,
      now,
    });
    if (claimed === 1) {
      return {
        attemptToken,
        kind: 'acquired',
        record: { ...current, status: 'RUNNING' },
      };
    }
  }

  throw new ReleaseMaintenanceTaskBusyError(input.task);
}

export async function runReleaseMaintenance(input: {
  ledger: ReleaseMaintenanceLedger;
  logger: ReleaseMaintenanceLogger;
  tasks: readonly ReleaseMaintenanceTaskDefinition[];
}) {
  for (const task of input.tasks) {
    const claim = await claimReleaseMaintenanceTask({
      ledger: input.ledger,
      task,
    });
    const details = { revision: task.revision, taskKey: task.taskKey };
    if (claim.kind === 'completed') {
      input.logger.info(details, 'release maintenance task skipped');
      continue;
    }

    input.logger.info(details, 'release maintenance task started');
    try {
      await task.run();
      const completed = await input.ledger.complete({
        attemptToken: claim.attemptToken,
        id: claim.record.id,
        now: new Date(),
      });
      if (completed !== 1) {
        throw new Error(
          `Release maintenance task ${task.taskKey} lost its claim`,
        );
      }
      input.logger.info(details, 'release maintenance task completed');
    } catch (error: unknown) {
      const message = errorMessage(error);
      const failed = await input.ledger.fail({
        attemptToken: claim.attemptToken,
        error: message,
        id: claim.record.id,
        now: new Date(),
      });
      if (failed !== 1) {
        throw new Error(
          `Release maintenance task ${task.taskKey} failed and its ledger claim was lost`,
          { cause: error },
        );
      }
      input.logger.error(
        { ...details, err: error },
        'release maintenance task failed',
      );
      throw error;
    }
  }
}
