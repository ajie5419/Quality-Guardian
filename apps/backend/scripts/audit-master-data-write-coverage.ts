import type { MasterDataGovernanceField } from '../utils/master-data-governance-registry';

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  listMasterDataGovernanceFields,
  listMasterDataGovernanceWaves,
} from '../utils/master-data-governance-registry';

interface CoverageHit {
  file: string;
  line: number;
  snippet: string;
  table: string;
}

interface TableCoverageReport {
  fieldKeys: string[];
  missingHits: CoverageHit[];
  skippedNonFieldWrites: number;
  table: string;
  totalWriteHits: number;
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

function parseIntegerList(input: string) {
  return String(input || '')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item));
}

function parseStringList(input: string) {
  return String(input || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function quoteForRegex(input: string) {
  return input.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function parseRgLine(line: string) {
  const firstColon = line.indexOf(':');
  const secondColon = line.indexOf(':', firstColon + 1);
  if (firstColon <= 0 || secondColon <= firstColon) return null;
  return {
    file: line.slice(0, firstColon),
    line: Number(line.slice(firstColon + 1, secondColon)),
    snippet: line.slice(secondColon + 1).trim(),
  };
}

function isGovernedSnippet(snippet: string) {
  const normalized = snippet.replaceAll(/\s+/g, ' ');
  return (
    normalized.includes('buildGoverned') ||
    normalized.includes('MasterDataGovernanceKernel') ||
    normalized.includes('governance-allow-direct-name-id') ||
    /\bgoverned[A-Z]\w*\b/u.test(normalized)
  );
}

function hasGovernanceContext(lines: string[], start: number, end: number) {
  const contextStart = Math.max(0, start - 24);
  for (let index = contextStart; index <= end; index += 1) {
    if (isGovernedSnippet(lines[index])) {
      return true;
    }
  }
  return false;
}

function hasTargetFieldAssignment(
  lines: string[],
  start: number,
  end: number,
  targetColumns: string[],
) {
  for (let index = start; index <= end; index += 1) {
    const line = lines[index];
    for (const column of targetColumns) {
      const pattern = new RegExp(
        `(^|[\\s{,])${quoteForRegex(column)}\\s*:`,
        'u',
      );
      if (pattern.test(line)) {
        return true;
      }
    }
  }
  return false;
}

function resolveWriteCallEnd(lines: string[], start: number) {
  const hardLimit = Math.min(lines.length - 1, start + 160);
  for (let index = start; index <= hardLimit; index += 1) {
    if (lines[index].includes('});')) {
      return index;
    }
  }
  return hardLimit;
}

function collectTableWriteHits(table: string, backendDir: string) {
  const pattern = `${quoteForRegex(table)}\\.(?:create|update|upsert)\\(`;
  const scanRoots = ['api', 'services', 'utils'].map((dir) =>
    path.resolve(backendDir, dir),
  );
  const result = spawnSync(
    'rg',
    [
      '-n',
      '--no-heading',
      '--color',
      'never',
      '-g',
      '*.ts',
      '-g',
      '!**/*.test.ts',
      pattern,
      ...scanRoots,
    ],
    {
      cwd: backendDir,
      encoding: 'utf8',
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      `[audit-master-data-write-coverage] rg failed for table ${table}: ${String(
        result.stderr || result.stdout || '',
      )}`,
    );
  }

  const lines = String(result.stdout || '')
    .split('\n')
    .map((item) => item.trimEnd())
    .filter(Boolean);

  const hits: CoverageHit[] = [];
  for (const line of lines) {
    const parsed = parseRgLine(line);
    if (!parsed) continue;
    hits.push({
      file: path.relative(backendDir, parsed.file),
      line: parsed.line,
      snippet: parsed.snippet,
      table,
    });
  }
  return hits;
}

function resolveBackendDir() {
  const cwd = process.cwd();
  const backendFromRoot = path.resolve(cwd, 'apps', 'backend');
  if (fs.existsSync(path.join(backendFromRoot, 'api'))) {
    return backendFromRoot;
  }
  if (fs.existsSync(path.join(cwd, 'api'))) {
    return cwd;
  }
  throw new Error('BACKEND_DIR_NOT_FOUND');
}

function buildTableFieldMap(fields: MasterDataGovernanceField[]) {
  const map = new Map<
    string,
    { fieldKeys: Set<string>; targetColumns: Set<string> }
  >();
  for (const field of fields) {
    for (const target of field.targets) {
      const entry = map.get(target.table) || {
        fieldKeys: new Set<string>(),
        targetColumns: new Set<string>(),
      };
      entry.fieldKeys.add(field.key);
      entry.targetColumns.add(target.nameColumn);
      map.set(target.table, entry);
    }
  }
  return map;
}

function resolveScopeFields(args: Map<string, string>) {
  const allFields = listMasterDataGovernanceFields();
  const validWaves = new Set(listMasterDataGovernanceWaves());
  const fieldsArg = String(args.get('fields') || '').trim();
  if (fieldsArg) {
    const selected = new Set(parseStringList(fieldsArg));
    return allFields.filter((field) => selected.has(field.key));
  }

  const wavesArg = String(args.get('waves') || '').trim();
  if (!wavesArg) {
    return allFields;
  }
  const selectedWaves = new Set(
    parseIntegerList(wavesArg).filter((wave) => validWaves.has(wave)),
  );
  return allFields.filter((field) => selectedWaves.has(field.rolloutWave));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const backendDir = resolveBackendDir();
  const fields = resolveScopeFields(args);
  if (fields.length === 0) {
    throw new Error('NO_FIELDS_SELECTED');
  }
  const tableFieldMap = buildTableFieldMap(fields);
  const reports: TableCoverageReport[] = [];

  for (const [table, metadata] of tableFieldMap.entries()) {
    const hits = collectTableWriteHits(table, backendDir);
    const missingHits: CoverageHit[] = [];
    let skippedNonFieldWrites = 0;
    for (const hit of hits) {
      const filePath = path.resolve(backendDir, hit.file);
      const fileLines = fs.readFileSync(filePath, 'utf8').split('\n');
      const start = Math.max(0, hit.line - 1);
      const end = resolveWriteCallEnd(fileLines, start);
      const hasTargetField = hasTargetFieldAssignment(fileLines, start, end, [
        ...metadata.targetColumns,
      ]);
      if (!hasTargetField) {
        skippedNonFieldWrites += 1;
        continue;
      }
      if (hasGovernanceContext(fileLines, start, end)) {
        continue;
      }
      missingHits.push(hit);
    }
    reports.push({
      table,
      fieldKeys: [...metadata.fieldKeys].sort(),
      totalWriteHits: hits.length,
      skippedNonFieldWrites,
      missingHits,
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    scope: {
      waves: [...new Set(fields.map((field) => field.rolloutWave))].sort(),
      fieldKeys: fields.map((field) => field.key),
    },
    totals: {
      tables: reports.length,
      totalWriteHits: reports.reduce(
        (sum, item) => sum + item.totalWriteHits,
        0,
      ),
      totalSkippedNonFieldWrites: reports.reduce(
        (sum, item) => sum + item.skippedNonFieldWrites,
        0,
      ),
      totalMissingHits: reports.reduce(
        (sum, item) => sum + item.missingHits.length,
        0,
      ),
    },
    tables: reports.sort((a, b) => b.missingHits.length - a.missingHits.length),
  };

  console.warn('[audit-master-data-write-coverage] result');
  console.warn(JSON.stringify(summary, null, 2));

  const repoRoot = backendDir.endsWith(`${path.sep}apps${path.sep}backend`)
    ? path.resolve(backendDir, '..', '..')
    : path.resolve(backendDir, '..');
  const outDir = path.resolve(
    repoRoot,
    'tmp',
    'master-data-governance',
    'write-coverage',
  );
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.resolve(
    outDir,
    `write-coverage-${new Date()
      .toISOString()
      .replaceAll(':', '-')
      .replaceAll('.', '-')}.json`,
  );
  fs.writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.warn('[audit-master-data-write-coverage] report');
  console.warn(JSON.stringify({ outPath }, null, 2));

  if (summary.totals.totalMissingHits > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error('[audit-master-data-write-coverage] failed', error);
  process.exitCode = 1;
});
