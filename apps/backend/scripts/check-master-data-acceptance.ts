import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

interface BacklogReport {
  statusBreakdown: {
    deferred: number;
    planned: number;
  };
  summary: {
    actionablePendingFields?: number;
    decisionCoverage: number;
    governedFields: number;
    pendingFields: number;
    semanticFields: number;
    undecidedFields: number;
  };
}

interface ConsistencyReport {
  summary: {
    allAligned: boolean;
    totalInvalidCanonicalId: number;
    totalMissingCanonicalId: number;
    totalOrphanValues: number;
  };
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const [key, value = ''] = item.slice(2).split('=');
    args.set(key, value);
  }
  return args;
}

function resolveRepoRoot() {
  const cwd = process.cwd();
  const backendSuffix = `${path.sep}apps${path.sep}backend`;
  if (cwd.endsWith(backendSuffix)) {
    return path.resolve(cwd, '..', '..');
  }
  return cwd;
}

async function findLatestJsonFile(dirPath: string, pattern?: RegExp) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = entries
    .filter((item) => item.isFile() && item.name.endsWith('.json'))
    .map((item) => item.name)
    .filter((name) => (pattern ? pattern.test(name) : true))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  return path.resolve(dirPath, files[0]);
}

async function readJson<T>(filePath: string) {
  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text) as T;
}

function assertBacklogReportShape(
  payload: BacklogReport,
  reportPath: string,
): asserts payload is BacklogReport {
  const hasBreakdown =
    payload &&
    typeof payload === 'object' &&
    payload.statusBreakdown &&
    typeof payload.statusBreakdown === 'object';
  const hasSummary =
    payload &&
    typeof payload === 'object' &&
    payload.summary &&
    typeof payload.summary === 'object';
  if (!hasBreakdown || !hasSummary) {
    throw new Error(`INVALID_BACKLOG_REPORT_SHAPE: ${reportPath}`);
  }
}

function assertConsistencyReportShape(
  payload: ConsistencyReport,
  reportPath: string,
): asserts payload is ConsistencyReport {
  const hasSummary =
    payload &&
    typeof payload === 'object' &&
    payload.summary &&
    typeof payload.summary === 'object';
  if (!hasSummary) {
    throw new Error(`INVALID_CONSISTENCY_REPORT_SHAPE: ${reportPath}`);
  }
}

function runNodeScript(scriptPath: string, args: string[]) {
  execFileSync(process.execPath, ['--import', 'tsx', scriptPath, ...args], {
    stdio: 'inherit',
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = resolveRepoRoot();
  const reportLabel =
    String(args.get('reportLabel') || '').trim() || 'acceptance';
  const scriptsDir = path.resolve(repoRoot, 'apps', 'backend', 'scripts');

  runNodeScript(
    path.resolve(scriptsDir, 'check-master-data-governance-backlog.ts'),
    [`--reportLabel=${reportLabel}`],
  );
  runNodeScript(path.resolve(scriptsDir, 'check-master-data-consistency.ts'), [
    `--reportLabel=${reportLabel}`,
  ]);

  const backlogDir = path.resolve(
    repoRoot,
    'tmp',
    'master-data-governance',
    'backlog',
  );
  const consistencyDir = path.resolve(
    repoRoot,
    'tmp',
    'master-data-governance',
    'consistency',
  );
  const backlogReportPath = await findLatestJsonFile(
    backlogDir,
    /^backlog-report-.*\.json$/,
  );
  const consistencyReportPath = await findLatestJsonFile(
    consistencyDir,
    /^consistency-report-.*\.json$/,
  );
  if (!backlogReportPath || !consistencyReportPath) {
    throw new Error('ACCEPTANCE_REPORT_NOT_FOUND');
  }

  const backlog = await readJson<BacklogReport>(backlogReportPath);
  const consistency = await readJson<ConsistencyReport>(consistencyReportPath);
  assertBacklogReportShape(backlog, backlogReportPath);
  assertConsistencyReportShape(consistency, consistencyReportPath);

  const failures: string[] = [];
  if (backlog.statusBreakdown.planned !== 0) {
    failures.push(`planned=${backlog.statusBreakdown.planned}`);
  }
  if (backlog.statusBreakdown.deferred !== 0) {
    failures.push(`deferred=${backlog.statusBreakdown.deferred}`);
  }
  if (backlog.summary.undecidedFields !== 0) {
    failures.push(`undecidedFields=${backlog.summary.undecidedFields}`);
  }
  if (Number(backlog.summary.decisionCoverage || 0) < 1) {
    failures.push(`decisionCoverage=${backlog.summary.decisionCoverage}`);
  }
  const actionablePendingFields = Number(
    backlog.summary.actionablePendingFields ??
      backlog.statusBreakdown.planned +
        backlog.statusBreakdown.deferred +
        backlog.summary.undecidedFields,
  );
  if (actionablePendingFields !== 0) {
    failures.push(`actionablePendingFields=${actionablePendingFields}`);
  }
  if (!consistency.summary.allAligned) {
    failures.push('allAligned=false');
  }
  if (consistency.summary.totalMissingCanonicalId !== 0) {
    failures.push(
      `totalMissingCanonicalId=${consistency.summary.totalMissingCanonicalId}`,
    );
  }
  if (consistency.summary.totalInvalidCanonicalId !== 0) {
    failures.push(
      `totalInvalidCanonicalId=${consistency.summary.totalInvalidCanonicalId}`,
    );
  }
  if (consistency.summary.totalOrphanValues !== 0) {
    failures.push(`totalOrphanValues=${consistency.summary.totalOrphanValues}`);
  }

  const summary = {
    backlogReportPath,
    consistencyReportPath,
    metrics: {
      semanticFields: backlog.summary.semanticFields,
      governedFields: backlog.summary.governedFields,
      pendingFields: backlog.summary.pendingFields,
      actionablePendingFields,
      planned: backlog.statusBreakdown.planned,
      deferred: backlog.statusBreakdown.deferred,
      undecidedFields: backlog.summary.undecidedFields,
      decisionCoverage: backlog.summary.decisionCoverage,
      allAligned: consistency.summary.allAligned,
      totalMissingCanonicalId: consistency.summary.totalMissingCanonicalId,
      totalInvalidCanonicalId: consistency.summary.totalInvalidCanonicalId,
      totalOrphanValues: consistency.summary.totalOrphanValues,
    },
    failures,
  };

  console.warn('[check-master-data-acceptance] result');
  console.warn(JSON.stringify(summary, null, 2));

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error('[check-master-data-acceptance] failed', error);
  process.exitCode = 1;
});
