import { describe, expect, it } from 'vitest';

import {
  buildMasterDataGovernanceBacklogReport,
  resolveRepoRoot,
} from './export-master-data-governance-backlog';
import { buildPendingByModuleOutput } from './export-master-data-pending-by-module';

describe('export-master-data-pending-by-module', () => {
  it('keeps supervision module fields and zh mapping for all 9 excluded fields', async () => {
    const report = await buildMasterDataGovernanceBacklogReport({
      repoRoot: resolveRepoRoot(),
      reportLabel: 'test-pending-by-module-supervision',
    });
    const output = buildPendingByModuleOutput(report);

    const supervision = output.modules.find(
      (moduleItem) => moduleItem.moduleKey === 'supervision',
    );

    expect(supervision).toBeDefined();
    expect(supervision?.pendingCount).toBe(9);
    expect(supervision?.excludedCount).toBe(9);

    const supervisionFields = supervision?.fields || [];
    expect(supervisionFields).toHaveLength(9);

    const expectedZhByFieldKey = new Map([
      ['supervision_milestones.delayReason', '监督里程碑延期原因'],
      ['supervision_milestones.name', '监督里程碑名称'],
      ['supervision_plan_steps.stepName', '监督计划步骤名'],
      ['supervision_plan_tasks.resourceName', '监督计划任务资源名'],
      ['supervision_plan_tasks.riskReason', '监督风险原因'],
      ['supervision_plan_tasks.taskName', '监督计划任务名'],
      ['supervision_projects.participants', '监督参与方'],
      ['supervision_report_task_updates.riskReason', '监督风险原因'],
      ['supervision_report_task_updates.taskName', '监督计划任务名'],
    ] as const);

    for (const [fieldKey, zhName] of expectedZhByFieldKey) {
      const hit = supervisionFields.find(
        (fieldItem) => fieldItem.fieldKey === fieldKey,
      );
      expect(hit, `missing ${fieldKey}`).toBeDefined();
      expect(hit?.fieldNameZh, `${fieldKey} missing zh mapping`).toBe(zhName);
    }
  });

  it('keeps summary totals aligned with backlog report', async () => {
    const report = await buildMasterDataGovernanceBacklogReport({
      repoRoot: resolveRepoRoot(),
      reportLabel: 'test-pending-by-module-summary',
    });
    const output = buildPendingByModuleOutput(report);

    expect(output.summary.totalPending).toBe(report.summary.pendingFields);
    expect(output.summary.totalExcluded).toBe(report.statusBreakdown.excluded);
    expect(output.summary.totalUndecided).toBe(report.summary.undecidedFields);
  });

  it('sorts modules by pendingCount in descending order', async () => {
    const report = await buildMasterDataGovernanceBacklogReport({
      repoRoot: resolveRepoRoot(),
      reportLabel: 'test-pending-by-module-sort',
    });
    const output = buildPendingByModuleOutput(report);

    for (let index = 1; index < output.modules.length; index += 1) {
      const prev = output.modules[index - 1]?.pendingCount || 0;
      const curr = output.modules[index]?.pendingCount || 0;
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });
});
