import { describe, expect, it } from 'vitest';

import { runExcludedFreezeCheck } from './check-master-data-excluded-freeze';

describe('check-master-data-excluded-freeze', () => {
  it('passes with current backlog config and report', async () => {
    const result = await runExcludedFreezeCheck();

    expect(result.ok).toBe(true);
    expect(result.failed).toHaveLength(0);
    expect(result.summary.excludedCount).toBe(17);
    expect(result.summary.supervisionExcludedCount).toBe(9);
    expect(result.summary.actionablePending).toBe(0);
  });

  it('fails when one supervision key is not excluded', async () => {
    const brokenConfig = {
      decisions: [
        { key: 'supervision_milestones.delayReason', status: 'excluded' },
        { key: 'supervision_milestones.name', status: 'excluded' },
        { key: 'supervision_plan_steps.stepName', status: 'excluded' },
        { key: 'supervision_plan_tasks.resourceName', status: 'excluded' },
        { key: 'supervision_plan_tasks.riskReason', status: 'excluded' },
        { key: 'supervision_plan_tasks.taskName', status: 'planned' },
        { key: 'supervision_projects.participants', status: 'excluded' },
        {
          key: 'supervision_report_task_updates.riskReason',
          status: 'excluded',
        },
        {
          key: 'supervision_report_task_updates.taskName',
          status: 'excluded',
        },
      ],
    };

    const result = await runExcludedFreezeCheck(brokenConfig);

    expect(result.ok).toBe(false);
    expect(
      result.failed.some((line) => line.startsWith('supervision-excluded:')),
    ).toBe(true);
  });
});
