import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  buildMasterDataGovernanceBacklogReport,
  resolveRepoRoot,
} from './export-master-data-governance-backlog';
import { buildPendingByModuleOutput } from './export-master-data-pending-by-module';

interface CheckResult {
  detail: string;
  key: string;
  pass: boolean;
}

type BacklogReport = Awaited<
  ReturnType<typeof buildMasterDataGovernanceBacklogReport>
>;
type PendingByModuleOutput = ReturnType<typeof buildPendingByModuleOutput>;

interface RunCheckInput {
  backlog?: BacklogReport;
  pendingByModule?: PendingByModuleOutput;
}

interface RunCheckResult {
  checks: CheckResult[];
  failed: string[];
  ok: boolean;
  summary: {
    excludedTotalFromModules: number;
    moduleCount: number;
    pendingTotalFromModules: number;
    supervisionExcluded: null | number;
    supervisionPending: null | number;
    totalExcluded: number;
    totalPending: number;
    totalUndecided: number;
  };
}

function buildFailureText(results: CheckResult[]) {
  return results
    .filter((item) => !item.pass)
    .map((item) => `${item.key}: ${item.detail}`);
}

function isNonIncreasing(values: number[]) {
  for (let index = 1; index < values.length; index += 1) {
    const prev = values[index - 1] || 0;
    const curr = values[index] || 0;
    if (prev < curr) return false;
  }
  return true;
}

export async function runPendingByModuleCheck(
  input: RunCheckInput = {},
): Promise<RunCheckResult> {
  const backlog =
    input.backlog ||
    (await buildMasterDataGovernanceBacklogReport({
      repoRoot: resolveRepoRoot(),
      reportLabel: 'check-pending-by-module',
    }));
  const output = input.pendingByModule || buildPendingByModuleOutput(backlog);

  let pendingTotalFromModules = 0;
  let excludedTotalFromModules = 0;
  for (const item of output.modules) {
    pendingTotalFromModules += item.pendingCount;
    excludedTotalFromModules += item.excludedCount;
  }

  const supervisionModule = output.modules.find(
    (item) => item.moduleKey === 'supervision',
  );

  const checks: CheckResult[] = [
    {
      key: 'summary-total-pending',
      pass: output.summary.totalPending === backlog.summary.pendingFields,
      detail: `summary=${output.summary.totalPending}, backlog=${backlog.summary.pendingFields}`,
    },
    {
      key: 'summary-total-excluded',
      pass: output.summary.totalExcluded === backlog.statusBreakdown.excluded,
      detail: `summary=${output.summary.totalExcluded}, backlog=${backlog.statusBreakdown.excluded}`,
    },
    {
      key: 'summary-total-undecided',
      pass: output.summary.totalUndecided === backlog.summary.undecidedFields,
      detail: `summary=${output.summary.totalUndecided}, backlog=${backlog.summary.undecidedFields}`,
    },
    {
      key: 'module-total-pending',
      pass: pendingTotalFromModules === output.summary.totalPending,
      detail: `moduleSum=${pendingTotalFromModules}, summary=${output.summary.totalPending}`,
    },
    {
      key: 'module-total-excluded',
      pass: excludedTotalFromModules === output.summary.totalExcluded,
      detail: `moduleSum=${excludedTotalFromModules}, summary=${output.summary.totalExcluded}`,
    },
    {
      key: 'module-order-desc',
      pass: isNonIncreasing(output.modules.map((item) => item.pendingCount)),
      detail: `pendingCounts=${JSON.stringify(output.modules.map((item) => item.pendingCount))}`,
    },
    {
      key: 'supervision-fixed-9-9',
      pass:
        (supervisionModule?.pendingCount || -1) === 9 &&
        (supervisionModule?.excludedCount || -1) === 9,
      detail: `pending=${supervisionModule?.pendingCount ?? null}, excluded=${supervisionModule?.excludedCount ?? null}`,
    },
  ];

  const failed = buildFailureText(checks);
  return {
    ok: failed.length === 0,
    failed,
    checks,
    summary: {
      moduleCount: output.summary.moduleCount,
      totalPending: output.summary.totalPending,
      totalExcluded: output.summary.totalExcluded,
      totalUndecided: output.summary.totalUndecided,
      pendingTotalFromModules,
      excludedTotalFromModules,
      supervisionPending: supervisionModule?.pendingCount ?? null,
      supervisionExcluded: supervisionModule?.excludedCount ?? null,
    },
  };
}

async function main() {
  const result = await runPendingByModuleCheck();
  if (!result.ok) {
    console.error('[check-master-data-pending-by-module] FAIL');
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
        checks: 7,
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
    console.error('[check-master-data-pending-by-module] failed', error);
    process.exitCode = 1;
  });
}

export default {
  runPendingByModuleCheck,
};
