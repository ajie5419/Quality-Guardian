#!/usr/bin/env node
// B-MF: metric registration gate (docs/metrics-registry.md).
//
// Scans backend aggregation calls (groupBy / aggregate / aggregate raw SQL)
// in modules/ and utils/ and requires every aggregation site to be registered
// either as a metric implementation point (utils/metrics-registry.ts,
// MetricRegistration.implementationPoints) or as an exempt non-metric point
// (EXEMPT_AGGREGATION_POINTS: sequence numbers, row locks, reconciliation,
// governance tooling, ops monitoring).
//
// Also verifies doc/code parity: the metric id set in docs/metrics-registry.md
// must equal the id set in utils/metrics-registry.ts.
//
// Output is TSV, same contract as check-qms-source-rules.mjs:
//   BASELINE\t<rule>\t<location>\t<message>
//   VIOLATION\t<rule>\t<location>\t<message>

import { readFileSync } from 'node:fs';
import path from 'node:path';

const REGISTRY_FILE = 'apps/backend/utils/metrics-registry.ts';
const DOC_FILE = 'docs/metrics-registry.md';

// groupBy( | .aggregate( | $queryRaw with aggregation SQL keywords
const AGGREGATION_PATTERN = /groupBy\(|\.aggregate\(|\$queryRaw/u;
const RAW_AGGREGATION_SQL = /(?:SUM|COUNT|AVG|GROUP BY|DISTINCT)\s*\(/u;
// Only raw SQL lines that actually aggregate (SUM/COUNT/AVG/GROUP BY).

const CONTROL_FLOW =
  /^(?:if|for|while|switch|catch|return|function|const|let|var)\b/u;
const FN_PATTERNS = [
  /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/u,
  /^\s*(\w+)\s*:\s*async\s*\(/u,
  /^\s*async\s+(\w+)\s*\(/u,
  /^\s*(\w+)\s*\([^)]*\)\s*\{\s*$/u,
];

function parseArguments(argv) {
  const options = {
    baseline: '',
    filesFrom: '',
    printBaseline: false,
    root: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--print-baseline') {
      options.printBaseline = true;
      continue;
    }
    if (
      argument === '--baseline' ||
      argument === '--files-from' ||
      argument === '--root'
    ) {
      const value = argv[index + 1];
      if (!value) throw new Error(`Missing value for ${argument}`);
      index += 1;
      if (argument === '--baseline') options.baseline = value;
      else if (argument === '--files-from') options.filesFrom = value;
      else options.root = value;
    }
  }

  return options;
}

function loadBaseline(filePath) {
  const baseline = new Map();
  if (!filePath) return baseline;
  try {
    const content = readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const [rule, file, key, count] = line.split('|');
      if (!rule || !file || !key) continue;
      baseline.set(`${rule}|${file}|${key}`, Number(count) || 1);
    }
  } catch {
    // Missing baseline file is fine: nothing is grandfathered.
  }
  return baseline;
}

function loadRegistry(rootDir) {
  let registryText;
  try {
    registryText = readFileSync(path.join(rootDir, REGISTRY_FILE), 'utf8');
  } catch {
    return new Set(); // no registry: every aggregation is unregistered
  }
  // Extract every `file#fn` point from implementationPoints and
  // EXEMPT_AGGREGATION_POINTS alike (full string, Set dedupes).
  const points = new Set();
  for (const match of registryText.matchAll(
    /'((?:modules|utils)\/[^']+#\w+)'/gu,
  )) {
    points.add(match[1]);
  }
  return points;
}

function findAggregationSites(rootDir, filePath) {
  const absolute = path.join(rootDir, filePath);
  let lines;
  try {
    lines = readFileSync(absolute, 'utf8').split(/\r?\n/u);
  } catch {
    return [];
  }

  const sites = [];
  let currentFn = null;
  for (const [index, line] of lines.entries()) {
    for (const pattern of FN_PATTERNS) {
      const match = line.match(pattern);
      if (match && !CONTROL_FLOW.test(match[1])) {
        currentFn = match[1];
        break;
      }
    }
    if (!currentFn || /^(?:main|build)$/u.test(currentFn)) continue;
    const isRawSql = line.includes('$queryRaw');
    const aggregates =
      AGGREGATION_PATTERN.test(line) &&
      (!isRawSql ||
        RAW_AGGREGATION_SQL.test(line) ||
        line.includes('GROUP BY'));
    if (aggregates) {
      sites.push({ fn: currentFn, line: index + 1 });
    }
  }
  return sites;
}

function loadDocIds(rootDir) {
  let docText;
  try {
    docText = readFileSync(path.join(rootDir, DOC_FILE), 'utf8');
  } catch {
    return new Set();
  }
  return new Set([...docText.matchAll(/\| (M-\w+) \|/gu)].map((m) => m[1]));
}

function loadCodeIds(rootDir) {
  let codeText;
  try {
    codeText = readFileSync(path.join(rootDir, REGISTRY_FILE), 'utf8');
  } catch {
    return new Set();
  }
  return new Set([...codeText.matchAll(/id: '(M-\w+)'/gu)].map((m) => m[1]));
}

function printRecord(fields) {
  process.stdout.write(
    `${fields.map((field) => String(field).replaceAll('\t', ' ')).join('\t')}\n`,
  );
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const rootDir = path.resolve(options.root);
  const baseline = loadBaseline(options.baseline);
  const registeredPoints = loadRegistry(rootDir);

  const findings = [];
  const seen = new Set();

  // 1. Aggregation sites in the scanned files.
  const files = options.filesFrom
    ? readFileSync(options.filesFrom, 'utf8').split(/\r?\n/u).filter(Boolean)
    : [];
  for (const filePath of files) {
    if (!/^(?:apps\/backend\/)?(?:modules|utils)\//u.test(filePath)) continue;
    if (/\.test\.ts$/u.test(filePath)) continue;
    const relative = filePath.startsWith('apps/backend/')
      ? filePath.slice('apps/backend/'.length)
      : filePath;
    if (!relative.startsWith('modules/') && !relative.startsWith('utils/'))
      continue;
    // Read via the full repo-relative path; the registry key uses the
    // apps/backend-relative path (modules/... or utils/...).
    for (const site of findAggregationSites(rootDir, filePath)) {
      const key = `${relative}#${site.fn}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (registeredPoints.has(key)) continue;
      findings.push({
        key: `fn-${site.fn}@${relative}`,
        location: `${relative}:${site.line}`,
        message: `aggregation in ${site.fn}() is not registered in docs/metrics-registry.md — add a metric entry (or EXEMPT_AGGREGATION_POINTS if non-metric) in utils/metrics-registry.ts.`,
      });
    }
  }

  // 2. Doc/code id parity.
  const docIds = loadDocIds(rootDir);
  const codeIds = loadCodeIds(rootDir);
  for (const id of codeIds) {
    if (!docIds.has(id)) {
      findings.push({
        key: `id-${id}`,
        location: `${DOC_FILE}:1`,
        message: `metric ${id} missing from docs/metrics-registry.md table.`,
      });
    }
  }
  for (const id of docIds) {
    if (!codeIds.has(id)) {
      findings.push({
        key: `id-${id}`,
        location: `${REGISTRY_FILE}:1`,
        message: `metric ${id} missing from utils/metrics-registry.ts registry.`,
      });
    }
  }

  const groups = new Map();
  for (const finding of findings) {
    const fingerprint = `B-MF|${finding.key}`;
    const group = groups.get(fingerprint) ?? [];
    group.push(finding);
    groups.set(fingerprint, group);
  }

  for (const [fingerprint, group] of groups) {
    const first = group[0];
    if (!first) continue;
    if (options.printBaseline) {
      process.stdout.write(`${fingerprint}|${group.length}\n`);
      continue;
    }
    const allowed = baseline.get(fingerprint) ?? 0;
    const suppressed = Math.min(allowed, group.length);
    if (suppressed > 0) {
      printRecord([
        'BASELINE',
        'B-MF',
        first.location,
        `${suppressed}/${allowed} existing violations`,
      ]);
    }
    for (const finding of group.slice(allowed)) {
      printRecord(['VIOLATION', 'B-MF', finding.location, finding.message]);
    }
  }
}

try {
  main();
} catch (error) {
  const message =
    error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
}
