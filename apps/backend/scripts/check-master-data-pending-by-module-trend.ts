import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export interface PendingByModuleSummary {
  moduleBreakdown?: Record<string, number>;
  totalExcluded: number;
  totalPending: number;
  totalUndecided: number;
}

interface PendingByModuleSnapshot {
  generatedAt?: string;
  modules?: Array<{
    moduleKey?: string;
    pendingCount?: number;
  }>;
  summary?: Partial<PendingByModuleSummary>;
}

export interface PendingByModuleTrendResult {
  after: PendingByModuleSummary;
  before: PendingByModuleSummary;
  checks: {
    moduleBreakdownNonIncreasing: boolean;
    totalExcludedNonIncreasing: boolean;
    totalPendingNonIncreasing: boolean;
    totalUndecidedZero: boolean;
  };
  failReasons: string[];
  pass: boolean;
}

function resolveRepoRoot() {
  const cwd = process.cwd();
  const backendSuffix = `${path.sep}apps${path.sep}backend`;
  if (cwd.endsWith(backendSuffix)) {
    return path.resolve(cwd, '..', '..');
  }
  return cwd;
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : Number.NaN;
}

export function parsePendingByModuleSummary(
  raw: unknown,
  sourceLabel: string,
): PendingByModuleSummary {
  const snapshot = raw as PendingByModuleSnapshot;
  const totalPending = toNumber(snapshot?.summary?.totalPending);
  const totalExcluded = toNumber(snapshot?.summary?.totalExcluded);
  const totalUndecided = toNumber(snapshot?.summary?.totalUndecided);

  const invalids: string[] = [];
  if (Number.isNaN(totalPending)) invalids.push('summary.totalPending');
  if (Number.isNaN(totalExcluded)) invalids.push('summary.totalExcluded');
  if (Number.isNaN(totalUndecided)) invalids.push('summary.totalUndecided');

  if (invalids.length > 0) {
    throw new TypeError(
      `[check-master-data-pending-by-module-trend] invalid snapshot ${sourceLabel}: ${invalids.join(', ')}`,
    );
  }

  const moduleBreakdown: Record<string, number> = {};
  const modules = Array.isArray(snapshot.modules) ? snapshot.modules : [];
  for (const moduleItem of modules) {
    const moduleKey = String(moduleItem?.moduleKey || '').trim();
    const pendingCount = toNumber(moduleItem?.pendingCount);
    if (!moduleKey || Number.isNaN(pendingCount)) continue;
    moduleBreakdown[moduleKey] = pendingCount;
  }

  return {
    moduleBreakdown,
    totalPending,
    totalExcluded,
    totalUndecided,
  };
}

export function evaluatePendingByModuleTrend(
  before: PendingByModuleSummary,
  after: PendingByModuleSummary,
): PendingByModuleTrendResult {
  const modules = new Set([
    ...Object.keys(after.moduleBreakdown || {}),
    ...Object.keys(before.moduleBreakdown || {}),
  ]);
  const moduleIncreaseReasons: string[] = [];
  for (const moduleKey of modules) {
    const beforeCount = Number(before.moduleBreakdown?.[moduleKey] || 0);
    const afterCount = Number(after.moduleBreakdown?.[moduleKey] || 0);
    if (afterCount > beforeCount) {
      moduleIncreaseReasons.push(
        `module pending increased: ${moduleKey} before=${beforeCount}, after=${afterCount}`,
      );
    }
  }

  const checks = {
    totalPendingNonIncreasing: after.totalPending <= before.totalPending,
    totalExcludedNonIncreasing: after.totalExcluded <= before.totalExcluded,
    totalUndecidedZero:
      before.totalUndecided === 0 && after.totalUndecided === 0,
    moduleBreakdownNonIncreasing: moduleIncreaseReasons.length === 0,
  };

  const failReasons: string[] = [];
  if (!checks.totalPendingNonIncreasing) {
    failReasons.push(
      `totalPending increased: before=${before.totalPending}, after=${after.totalPending}`,
    );
  }
  if (!checks.totalExcludedNonIncreasing) {
    failReasons.push(
      `totalExcluded increased: before=${before.totalExcluded}, after=${after.totalExcluded}`,
    );
  }
  if (!checks.totalUndecidedZero) {
    failReasons.push(
      `totalUndecided must stay 0: before=${before.totalUndecided}, after=${after.totalUndecided}`,
    );
  }
  failReasons.push(...moduleIncreaseReasons);

  return {
    pass: failReasons.length === 0,
    before,
    after,
    checks,
    failReasons,
  };
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content) as unknown;
}

async function pickLatestTwoReports(backlogDir: string): Promise<string[]> {
  const entries = await fs.readdir(backlogDir, { withFileTypes: true });
  const files = entries
    .filter(
      (entry) =>
        entry.isFile() && /^pending-by-module-.*\.json$/.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort();

  if (files.length < 2) {
    throw new TypeError(
      `[check-master-data-pending-by-module-trend] requires at least 2 pending-by-module reports in ${backlogDir}`,
    );
  }

  const latestTwo = files.slice(-2);
  return latestTwo.map((name) => path.resolve(backlogDir, name));
}

async function main() {
  const repoRoot = resolveRepoRoot();
  const backlogDir = path.resolve(
    repoRoot,
    'tmp',
    'master-data-governance',
    'backlog',
  );

  const [beforePath, afterPath] = await pickLatestTwoReports(backlogDir);
  const beforeRaw = await readJsonFile(beforePath);
  const afterRaw = await readJsonFile(afterPath);

  const before = parsePendingByModuleSummary(beforeRaw, beforePath);
  const after = parsePendingByModuleSummary(afterRaw, afterPath);
  const result = evaluatePendingByModuleTrend(before, after);

  process.stdout.write(
    `${JSON.stringify(
      {
        pass: result.pass,
        beforePath,
        afterPath,
        before: result.before,
        after: result.after,
        failReasons: result.failReasons,
      },
      null,
      2,
    )}\n`,
  );

  if (!result.pass) {
    process.exitCode = 1;
  }
}

const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
const selfFile = fileURLToPath(import.meta.url);

if (entryFile === selfFile) {
  main().catch((error: unknown) => {
    console.error('[check-master-data-pending-by-module-trend] failed', error);
    process.exitCode = 1;
  });
}
