import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

interface MetricsSnapshot {
  generatedAt: string;
  summary: {
    allAligned: boolean;
    scannedFields: string[];
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

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJson<T>(filePath: string) {
  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text) as T;
}

async function pickLatestMetricFile(dir: string) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((item) => item.isFile() && item.name.endsWith('.json'))
    .map((item) => item.name)
    .sort()
    .reverse();
  if (files.length === 0) return null;
  return path.join(dir, files[0]);
}

async function pickLatestConsistencyFile(dir: string) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true, encoding: 'utf8' });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return null;
    throw error;
  }
  const files = entries
    .filter((item) => item.isFile() && item.name.endsWith('.json'))
    .map((item) => item.name)
    .sort()
    .reverse();
  if (files.length === 0) return null;
  return path.join(dir, files[0]);
}

function createMetricSnapshot(raw: unknown): MetricsSnapshot {
  const input = raw as {
    summary?: {
      allAligned?: boolean;
      scannedFields?: string[];
      totalInvalidCanonicalId?: number;
      totalMissingCanonicalId?: number;
      totalOrphanValues?: number;
    };
  };
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      allAligned: Boolean(input.summary?.allAligned),
      scannedFields: Array.isArray(input.summary?.scannedFields)
        ? input.summary.scannedFields
        : [],
      totalInvalidCanonicalId: Number(
        input.summary?.totalInvalidCanonicalId || 0,
      ),
      totalMissingCanonicalId: Number(
        input.summary?.totalMissingCanonicalId || 0,
      ),
      totalOrphanValues: Number(input.summary?.totalOrphanValues || 0),
    },
  };
}

function checkTrend(
  previous: MetricsSnapshot | null,
  current: MetricsSnapshot,
  allowRegression: boolean,
) {
  const regressions: string[] = [];
  if (previous) {
    const checks: Array<{
      current: number;
      key: string;
      previous: number;
    }> = [
      {
        key: 'totalMissingCanonicalId',
        previous: previous.summary.totalMissingCanonicalId,
        current: current.summary.totalMissingCanonicalId,
      },
      {
        key: 'totalInvalidCanonicalId',
        previous: previous.summary.totalInvalidCanonicalId,
        current: current.summary.totalInvalidCanonicalId,
      },
      {
        key: 'totalOrphanValues',
        previous: previous.summary.totalOrphanValues,
        current: current.summary.totalOrphanValues,
      },
    ];
    for (const item of checks) {
      if (item.current > item.previous) {
        regressions.push(
          `${item.key} regressed from ${item.previous} to ${item.current}`,
        );
      }
    }
  }
  if (regressions.length > 0 && !allowRegression) {
    throw new Error(`METRIC_REGRESSION:${regressions.join('; ')}`);
  }
  return regressions;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = resolveRepoRoot();
  const allowRegression =
    String(args.get('allowRegression') || '')
      .trim()
      .toLowerCase() === 'true';
  const outputDir =
    String(args.get('outputDir') || '').trim() ||
    path.resolve(repoRoot, 'tmp', 'master-data-governance', 'metrics');
  await ensureDir(outputDir);

  const consistencyDir =
    String(args.get('consistencyDir') || '').trim() ||
    path.resolve(repoRoot, 'tmp', 'master-data-governance', 'consistency');
  const currentReportArg = String(args.get('current') || '').trim();
  const autoCurrentReport = await pickLatestConsistencyFile(consistencyDir);
  const currentReportPath = currentReportArg
    ? path.resolve(currentReportArg)
    : autoCurrentReport;
  if (!currentReportPath) {
    throw new TypeError(
      `USAGE: --current=/absolute/path/to/consistency-report.json (or ensure latest report exists under ${consistencyDir})`,
    );
  }

  const latestPath = await pickLatestMetricFile(outputDir);
  const previous = latestPath
    ? await readJson<MetricsSnapshot>(latestPath)
    : null;
  const currentRaw = await readJson<unknown>(path.resolve(currentReportPath));
  const current = createMetricSnapshot(currentRaw);
  const regressions = checkTrend(previous, current, allowRegression);

  const fileName = `metrics-${new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')}.json`;
  const outputPath = path.join(outputDir, fileName);
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(current, null, 2)}\n`,
    'utf8',
  );

  console.warn('[check-master-data-metrics-trend] result');
  console.warn(
    JSON.stringify(
      {
        currentReportPath,
        previousPath: latestPath,
        outputPath,
        regressions,
        current: current.summary,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error('[check-master-data-metrics-trend] failed', error);
  process.exitCode = 1;
});
