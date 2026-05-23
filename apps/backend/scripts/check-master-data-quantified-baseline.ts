import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export interface QuantifiedBaseline {
  canonical_fields: number;
  excluded_business_excluded: number;
  excluded_canonical_source: number;
  excluded_covered_by_governance: number;
  excluded_other: number;
  excluded_system_metadata: number;
  excluded_total: number;
  name_only_fields: number;
  total_fields: number;
}

interface ObjectiveAuditReport {
  quantified?: Partial<Record<keyof QuantifiedBaseline, unknown>>;
}

interface CompareResult {
  actual: QuantifiedBaseline;
  baseline: QuantifiedBaseline;
  mismatches: string[];
  pass: boolean;
}

interface RunCheckOptions {
  pickLatestReportPath?: (dirPath: string) => Promise<null | string>;
  readJson?: (filePath: string) => Promise<unknown>;
  repoRoot?: string;
  runObjectiveAudit?: (repoRoot: string) => Promise<void>;
}

export const OBJECTIVE_QUANTIFIED_BASELINE: QuantifiedBaseline = {
  total_fields: 47,
  canonical_fields: 37,
  name_only_fields: 10,
  excluded_total: 17,
  excluded_system_metadata: 7,
  excluded_business_excluded: 9,
  excluded_canonical_source: 0,
  excluded_covered_by_governance: 0,
  excluded_other: 1,
};

function resolveRepoRoot() {
  const cwd = process.cwd();
  const backendSuffix = `${path.sep}apps${path.sep}backend`;
  if (cwd.endsWith(backendSuffix)) {
    return path.resolve(cwd, '..', '..');
  }
  return cwd;
}

function toFiniteNumber(value: unknown): null | number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function parseQuantified(input: unknown, source: string): QuantifiedBaseline {
  const report = input as ObjectiveAuditReport;
  const quantified = report?.quantified || {};
  const invalidFields: string[] = [];

  const readField = (key: keyof QuantifiedBaseline) => {
    const value = toFiniteNumber(quantified[key]);
    if (value === null) invalidFields.push(key);
    return value ?? Number.NaN;
  };

  const parsed: QuantifiedBaseline = {
    total_fields: readField('total_fields'),
    canonical_fields: readField('canonical_fields'),
    name_only_fields: readField('name_only_fields'),
    excluded_total: readField('excluded_total'),
    excluded_system_metadata: readField('excluded_system_metadata'),
    excluded_business_excluded: readField('excluded_business_excluded'),
    excluded_canonical_source: readField('excluded_canonical_source'),
    excluded_covered_by_governance: readField('excluded_covered_by_governance'),
    excluded_other: readField('excluded_other'),
  };

  if (invalidFields.length > 0) {
    throw new TypeError(
      `[check-master-data-quantified-baseline] invalid quantified fields in ${source}: ${invalidFields.join(', ')}`,
    );
  }

  return parsed;
}

function compareQuantifiedBaseline(
  actual: QuantifiedBaseline,
  baseline: QuantifiedBaseline = OBJECTIVE_QUANTIFIED_BASELINE,
): CompareResult {
  const mismatches: string[] = [];
  const keys = Object.keys(baseline) as Array<keyof QuantifiedBaseline>;
  for (const key of keys) {
    if (actual[key] !== baseline[key]) {
      mismatches.push(
        `${key}: expected=${baseline[key]}, actual=${actual[key]}`,
      );
    }
  }

  return {
    pass: mismatches.length === 0,
    mismatches,
    baseline,
    actual,
  };
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content) as unknown;
}

async function pickLatestObjectiveAuditReport(
  dirPath: string,
): Promise<null | string> {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return null;
    throw error;
  }

  const latest = entries
    .filter(
      (entry) =>
        entry.isFile() && /^objective-audit-.*\.json$/.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort()
    .slice(-1)[0];

  if (!latest) return null;
  return path.resolve(dirPath, latest);
}

async function runObjectiveAudit(repoRoot: string): Promise<void> {
  const result = spawnSync(
    'pnpm',
    ['--dir', 'apps/backend', 'run', 'db:check-master-data-objective-audit'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `[check-master-data-quantified-baseline] failed to generate objective-audit report, exit=${result.status}`,
    );
  }
}

export async function runQuantifiedBaselineCheck(
  options: RunCheckOptions = {},
): Promise<{
  actual: QuantifiedBaseline;
  baseline: QuantifiedBaseline;
  mismatches: string[];
  pass: boolean;
  reportPath: string;
}> {
  const repoRoot = options.repoRoot || resolveRepoRoot();
  const objectiveAuditDir = path.resolve(
    repoRoot,
    'tmp',
    'master-data-governance',
    'objective-audit',
  );
  const pickReport =
    options.pickLatestReportPath || pickLatestObjectiveAuditReport;
  const readJson = options.readJson || readJsonFile;
  const generate = options.runObjectiveAudit || runObjectiveAudit;

  let reportPath = await pickReport(objectiveAuditDir);
  if (!reportPath) {
    await generate(repoRoot);
    reportPath = await pickReport(objectiveAuditDir);
  }
  if (!reportPath) {
    throw new TypeError(
      `[check-master-data-quantified-baseline] objective-audit report not found in ${objectiveAuditDir}`,
    );
  }

  const report = await readJson(reportPath);
  const actual = parseQuantified(report, reportPath);
  const compared = compareQuantifiedBaseline(actual);
  return {
    pass: compared.pass,
    mismatches: compared.mismatches,
    baseline: compared.baseline,
    actual: compared.actual,
    reportPath,
  };
}

async function main() {
  const result = await runQuantifiedBaselineCheck();
  process.stdout.write(
    `${JSON.stringify(
      {
        pass: result.pass,
        reportPath: result.reportPath,
        baseline: result.baseline,
        actual: result.actual,
        mismatches: result.mismatches,
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
    console.error('[check-master-data-quantified-baseline] failed', error);
    process.exitCode = 1;
  });
}

export default {
  OBJECTIVE_QUANTIFIED_BASELINE,
  runQuantifiedBaselineCheck,
};
