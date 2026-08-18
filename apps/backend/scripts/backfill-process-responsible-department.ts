// Maintenance entry: assign process default responsible departments.
// Usage:
//   tsx scripts/backfill-process-responsible-department.ts            # dry-run
//   tsx scripts/backfill-process-responsible-department.ts --apply    # execute
import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';

import {
  DEFAULT_PROCESS_DEPARTMENT_ASSIGNMENTS,
  runProcessResponsibleDepartmentBackfill,
} from './process-responsible-department-backfill';

const logger = createModuleLogger('process-responsible-department-backfill');

async function main() {
  const mode = process.argv.includes('--apply') ? 'apply' : 'dry-run';
  const summary = await runProcessResponsibleDepartmentBackfill({
    assignments: DEFAULT_PROCESS_DEPARTMENT_ASSIGNMENTS,
    mode,
  });
  for (const entry of summary.entries) {
    if (entry.action === 'unresolved') {
      logger.warn(
        {
          candidates: entry.candidates,
          processName: entry.processName,
          reason: entry.reason,
        },
        'unresolved assignment',
      );
      continue;
    }
    logger.info(
      {
        departmentId: entry.departmentId,
        mode: entry.action,
        processName: entry.processName,
        supplierSourceMismatch: entry.supplierSourceMismatch,
      },
      entry.action === 'skipped' ? 'already configured' : 'assignment applied',
    );
  }
  logger.info(
    {
      mode,
      planned: summary.planned,
      skipped: summary.skipped,
      unresolved: summary.unresolved,
      updated: summary.updated,
    },
    'process responsible department backfill summary',
  );
  if (mode === 'apply' && summary.unresolved > 0) {
    throw new Error(
      'Some assignments could not be resolved; fix the mapping and re-run',
    );
  }
}

main().catch((error: unknown) => {
  logger.error(error, 'process responsible department backfill failed');
  process.exitCode = 1;
});
