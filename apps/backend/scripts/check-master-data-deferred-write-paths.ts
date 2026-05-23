import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

interface BacklogDecision {
  key: string;
  status: 'deferred' | 'excluded' | 'planned';
}

interface DeferredDecision {
  column: string;
  key: string;
  table: string;
}

interface DeferredWritePathHit {
  file: string;
  line: number;
  text: string;
}

interface DeferredViolation {
  entry: DeferredDecision;
  hits: DeferredWritePathHit[];
}

const BACKLOG_CONFIG_PATH = path.resolve(
  process.cwd(),
  'config',
  'master-data-governance-backlog.json',
);

const SEARCH_ROOTS = ['api', 'services', 'utils'].map((segment) =>
  path.resolve(process.cwd(), segment),
);

function parseTableColumnKey(value: string) {
  const normalized = String(value || '').trim();
  const separatorIndex = normalized.indexOf('.');
  if (separatorIndex <= 0 || separatorIndex >= normalized.length - 1) {
    return null;
  }
  return {
    table: normalized.slice(0, separatorIndex),
    column: normalized.slice(separatorIndex + 1),
  };
}

async function readDeferredDecisions() {
  const content = await fs.readFile(BACKLOG_CONFIG_PATH, 'utf8');
  const parsed = JSON.parse(content) as { decisions?: BacklogDecision[] };
  const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
  const deferred: DeferredDecision[] = [];
  for (const item of decisions) {
    if (item?.status !== 'deferred') continue;
    const parsedKey = parseTableColumnKey(item.key);
    if (!parsedKey) continue;
    deferred.push({
      key: item.key,
      table: parsedKey.table,
      column: parsedKey.column,
    });
  }
  return deferred;
}

async function collectSourceFiles() {
  const files: string[] = [];
  for (const root of SEARCH_ROOTS) {
    let entries: string[] = [];
    try {
      entries = await listTsFiles(root);
    } catch {
      continue;
    }
    files.push(...entries);
  }
  return files;
}

async function listTsFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) continue;
    const stats = await fs.stat(current);
    if (stats.isDirectory()) {
      const children = await fs.readdir(current);
      for (const child of children) {
        if (child === 'node_modules') continue;
        queue.push(path.join(current, child));
      }
      continue;
    }
    if (!current.endsWith('.ts')) continue;
    output.push(current);
  }
  return output;
}

function buildSearchPatterns(entry: DeferredDecision) {
  const tableExpr = `prisma.${entry.table}.`;
  const writeMethodExpr =
    '(create|update|upsert|createMany|updateMany|$executeRaw|$queryRaw)';
  const tableWriteRegex = new RegExp(
    `${escapeRegex(tableExpr)}${writeMethodExpr}`,
    'u',
  );
  const nestedTableRegex = new RegExp(`${escapeRegex(entry.table)}\\s*:`, 'u');
  const columnRegex = new RegExp(`${escapeRegex(entry.column)}\\s*:`, 'u');
  return {
    columnRegex,
    nestedTableRegex,
    tableWriteRegex,
  };
}

function escapeRegex(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function findHitsForEntry(
  entry: DeferredDecision,
  files: Array<{ path: string; text: string }>,
) {
  const patterns = buildSearchPatterns(entry);
  const hits: DeferredWritePathHit[] = [];
  for (const file of files) {
    const lines = file.text.split('\n');
    let hasTableWriteContext = false;
    for (const line of lines) {
      if (patterns.tableWriteRegex.test(line)) {
        hasTableWriteContext = true;
        break;
      }
      if (patterns.nestedTableRegex.test(line)) {
        hasTableWriteContext = true;
        break;
      }
    }
    if (!hasTableWriteContext) continue;
    lines.forEach((line, index) => {
      if (!patterns.columnRegex.test(line)) return;
      hits.push({
        file: file.path,
        line: index + 1,
        text: line.trim(),
      });
    });
  }
  return hits;
}

async function main() {
  const deferred = await readDeferredDecisions();
  const sourceFilePaths = await collectSourceFiles();
  const loadedFiles = await Promise.all(
    sourceFilePaths.map(async (filePath) => ({
      path: filePath,
      text: await fs.readFile(filePath, 'utf8'),
    })),
  );

  const violations: DeferredViolation[] = [];
  for (const entry of deferred) {
    const hits = findHitsForEntry(entry, loadedFiles);
    if (hits.length === 0) continue;
    violations.push({
      entry,
      hits,
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    deferredFields: deferred.length,
    scannedFiles: loadedFiles.length,
    violationCount: violations.length,
    violations,
    guidance:
      'Deferred fields must not have active write paths. If writes exist, move field into registry governance and update backlog status.',
  };

  console.warn('[check-master-data-deferred-write-paths] result');
  console.warn(JSON.stringify(summary, null, 2));

  if (violations.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error('[check-master-data-deferred-write-paths] failed', error);
  process.exitCode = 1;
});
