/**
 * In-memory cron job registry.
 *
 * Business modules register their periodic jobs here during module load
 * (apply-time of the scheduler plugin). The scheduler service persists the
 * definitions into the cron_jobs table and executes due handlers.
 *
 * Handlers MUST be idempotent: the scheduler guarantees at-most-once per
 * minute via lastRunAt CAS, but crashes between run and record can re-run.
 */

export interface CronJobDefinition {
  /** Globally unique key, convention: `<module>.<action>` (e.g. 'metrology.due-reminder'). */
  key: string;
  /** 5-field cron expression: minute hour day month weekday. */
  cronExpr: string;
  description?: string;
  /** Idempotent job body. Must not throw raw; scheduler records lastError. */
  handler: () => Promise<void>;
}

const registry = new Map<string, CronJobDefinition>();

export function registerCronJob(definition: CronJobDefinition): void {
  if (registry.has(definition.key)) {
    throw new Error(`duplicate cron job key: ${definition.key}`);
  }
  registry.set(definition.key, definition);
}

export function getCronJob(key: string): CronJobDefinition | undefined {
  return registry.get(key);
}

export function listCronJobs(): CronJobDefinition[] {
  return [...registry.values()];
}

/** Test helper: clear registry (only used in tests). */
export function clearCronJobRegistry(): void {
  registry.clear();
}
