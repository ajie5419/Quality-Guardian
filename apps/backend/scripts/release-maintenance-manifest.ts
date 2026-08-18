import {
  DEFAULT_PROCESS_DEPARTMENT_ASSIGNMENTS,
  runProcessResponsibleDepartmentBackfill,
} from './process-responsible-department-backfill';

export interface ReleaseMaintenanceTaskDefinition {
  checksum: string;
  /** The application release that first requires this task before startup. */
  introducedIn: string;
  revision: number;
  run: () => Promise<void>;
  taskKey: string;
}

/**
 * Historical releases used a permanent shell list. Those waves are retired:
 * a fresh ledger deliberately does not replay them, because their effects have
 * already shipped or require separately governed remediation.
 *
 * Add an entry here only when a release cannot safely start until its idempotent
 * data task succeeds. A changed task definition must get a new revision and
 * checksum; never edit a completed revision in place.
 */
export const releaseMaintenanceManifest: readonly ReleaseMaintenanceTaskDefinition[] =
  [
    {
      checksum:
        'd0c028aeb3baed4d967ea1e3a0fd45b1666c632ab27a62399516b3cbe7b48945',
      introducedIn: '0.28.0',
      revision: 1,
      run: async () => {
        const summary = await runProcessResponsibleDepartmentBackfill({
          assignments: DEFAULT_PROCESS_DEPARTMENT_ASSIGNMENTS,
          mode: 'apply',
        });
        if (summary.unresolved > 0) {
          const detail = summary.entries
            .filter((entry) => entry.action === 'unresolved')
            .map((entry) => `${entry.processName}: ${entry.reason}`)
            .join('; ');
          throw new Error(
            `Process responsible department backfill unresolved: ${detail}`,
          );
        }
      },
      taskKey: 'process-responsible-department-backfill',
    },
  ];

export const retiredHistoricalReleaseMaintenanceTaskKeys = [
  'rbac-role-page-permissions',
  'work-order-confirm-permission',
  'identity-relation-backfill',
  'inspection-request-category-backfill',
  'inspection-request-process-option-backfill',
  'inspection-request-process-outsourcing-responsibility-bootstrap',
  'inspection-request-responsibility-backfill',
  'inspection-issue-responsibility-backfill',
  'quality-classification-backfill',
] as const;

const FORBIDDEN_RELEASE_TASK_KEY =
  /sidecar|projection|reconcile|supplier-score|team-merge|remediate|governance/u;

/** Reject task classes that must run outside the synchronous release path. */
export function assertValidReleaseMaintenanceManifest(
  tasks: readonly ReleaseMaintenanceTaskDefinition[],
) {
  const seen = new Set<string>();
  for (const task of tasks) {
    const identity = `${task.taskKey}@${task.revision}`;
    if (seen.has(identity)) {
      throw new Error(`Duplicate release maintenance task: ${identity}`);
    }
    if (FORBIDDEN_RELEASE_TASK_KEY.test(task.taskKey)) {
      throw new Error(
        `Release maintenance task is not a startup prerequisite: ${task.taskKey}`,
      );
    }
    if (!/^[a-f0-9]{64}$/u.test(task.checksum)) {
      throw new Error(`Invalid release maintenance checksum: ${identity}`);
    }
    seen.add(identity);
  }
}
