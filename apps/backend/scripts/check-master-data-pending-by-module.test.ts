import { describe, expect, it } from 'vitest';

import { runPendingByModuleCheck } from './check-master-data-pending-by-module';
import {
  buildMasterDataGovernanceBacklogReport,
  resolveRepoRoot,
} from './export-master-data-governance-backlog';
import { buildPendingByModuleOutput } from './export-master-data-pending-by-module';

describe('check-master-data-pending-by-module', () => {
  it('passes all checks with current generated output', async () => {
    const result = await runPendingByModuleCheck();

    expect(result.ok).toBe(true);
    expect(result.failed).toHaveLength(0);
    expect(result.summary.totalPending).toBeGreaterThan(0);
    expect(result.summary.supervisionPending).toBe(9);
    expect(result.summary.supervisionExcluded).toBe(9);
  });

  it('fails when modules are not sorted by pendingCount descending', async () => {
    const backlog = await buildMasterDataGovernanceBacklogReport({
      repoRoot: resolveRepoRoot(),
      reportLabel: 'test-check-pending-by-module-fail',
    });
    const output = buildPendingByModuleOutput(backlog);

    const modules = [...output.modules];
    expect(modules.length).toBeGreaterThan(1);
    const first = modules[0];
    const second = modules[1];
    if (!first || !second) {
      throw new Error('insufficient modules for failure case');
    }

    modules[0] = second;
    modules[1] = first;

    const result = await runPendingByModuleCheck({
      backlog,
      pendingByModule: {
        ...output,
        modules,
      },
    });

    expect(result.ok).toBe(false);
    expect(
      result.failed.some((line) => line.startsWith('module-order-desc:')),
    ).toBe(true);
  });
});
