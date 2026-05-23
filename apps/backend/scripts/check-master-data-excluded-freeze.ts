import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  buildMasterDataGovernanceBacklogReport,
  resolveRepoRoot,
} from './export-master-data-governance-backlog';

type BacklogStatus = 'deferred' | 'excluded' | 'planned';

interface BacklogDecision {
  key?: string;
  status?: BacklogStatus | string;
}

interface BacklogConfig {
  decisions?: BacklogDecision[];
}

interface ExcludedFreezeSummary {
  actionablePending: number;
  decisionCount: number;
  deferredCount: number;
  excludedCount: number;
  plannedCount: number;
  supervisionExcludedCount: number;
  undecidedCount: number;
}

interface ExcludedFreezeCheckResult {
  failed: string[];
  ok: boolean;
  summary: ExcludedFreezeSummary;
}

const REQUIRED_SUPERVISION_EXCLUDED_KEYS = [
  'supervision_milestones.delayReason',
  'supervision_milestones.name',
  'supervision_plan_steps.stepName',
  'supervision_plan_tasks.resourceName',
  'supervision_plan_tasks.riskReason',
  'supervision_plan_tasks.taskName',
  'supervision_projects.participants',
  'supervision_report_task_updates.riskReason',
  'supervision_report_task_updates.taskName',
] as const;

function normalizeDecisions(raw: BacklogConfig) {
  const decisions = Array.isArray(raw.decisions) ? raw.decisions : [];
  return decisions
    .map((item) => ({
      key: String(item.key || '').trim(),
      status: String(item.status || '').trim(),
    }))
    .filter((item) => Boolean(item.key));
}

function checkSupervisionExcluded(
  decisions: Array<{ key: string; status: string }>,
) {
  const byKey = new Map(decisions.map((item) => [item.key, item.status]));
  const missing = REQUIRED_SUPERVISION_EXCLUDED_KEYS.filter(
    (key) => byKey.get(key) !== 'excluded',
  );
  return {
    missing,
    matchedCount: REQUIRED_SUPERVISION_EXCLUDED_KEYS.length - missing.length,
  };
}

export async function runExcludedFreezeCheck(
  input?: BacklogConfig,
): Promise<ExcludedFreezeCheckResult> {
  const repoRoot = resolveRepoRoot();
  const backlogPath = path.resolve(
    repoRoot,
    'apps',
    'backend',
    'config',
    'master-data-governance-backlog.json',
  );

  const config =
    input ||
    (JSON.parse(
      await fs.readFile(backlogPath, 'utf8'),
    ) as unknown as BacklogConfig);

  const normalizedDecisions = normalizeDecisions(config);
  const supervision = checkSupervisionExcluded(normalizedDecisions);

  const report = await buildMasterDataGovernanceBacklogReport({
    repoRoot,
    reportLabel: 'check-excluded-freeze',
  });

  const excludedCount = report.statusBreakdown.excluded;
  const plannedCount = report.statusBreakdown.planned;
  const deferredCount = report.statusBreakdown.deferred;
  const undecidedCount = report.summary.undecidedFields;
  const actionablePending = report.summary.actionablePendingFields;

  const failed: string[] = [];
  if (excludedCount !== 17) {
    failed.push(`excluded-count: expected=17, actual=${excludedCount}`);
  }
  if (supervision.missing.length > 0) {
    failed.push(
      `supervision-excluded: missing=${JSON.stringify(supervision.missing)}`,
    );
  }
  if (plannedCount !== 0 || deferredCount !== 0 || undecidedCount !== 0) {
    failed.push(
      `actionable-pending: expected=0, actual=${actionablePending} (planned=${plannedCount}, deferred=${deferredCount}, undecided=${undecidedCount})`,
    );
  }

  return {
    ok: failed.length === 0,
    failed,
    summary: {
      decisionCount: normalizedDecisions.length,
      excludedCount,
      plannedCount,
      deferredCount,
      undecidedCount,
      actionablePending,
      supervisionExcludedCount: supervision.matchedCount,
    },
  };
}

async function main() {
  const result = await runExcludedFreezeCheck();
  if (!result.ok) {
    console.error('[check-master-data-excluded-freeze] FAIL');
    for (const line of result.failed) {
      console.error(`- ${line}`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        summary: result.summary,
      },
      null,
      2,
    )}\n`,
  );
}

const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
const selfFile = fileURLToPath(import.meta.url);
if (entryFile === selfFile) {
  main().catch((error: unknown) => {
    console.error('[check-master-data-excluded-freeze] failed', error);
    process.exitCode = 1;
  });
}

export default {
  runExcludedFreezeCheck,
};
