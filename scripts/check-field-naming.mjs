#!/usr/bin/env node
// Field naming rules for apps/backend/prisma/schema.prisma
// (contract: docs/data-contract.md §4 — 字段命名规则, P2 automation).
//
//   B-N1: Boolean scalar fields must be prefixed with is/has (isDeleted, hasOwner)
//   B-N2: DateTime scalar fields must end with At, or match a documented
//         semantic-time exception (date, *Date, *Until, *Time, *AtCutoff, *AtSnapshot)
//   B-N3: scalar field names must be camelCase (no underscores)
//
// Only scalar columns are checked; relation fields that mirror snake_case
// table names (e.g. `work_order (work_orders)`) are out of scope.
// Legacy non-compliant fields are grandfathered via the baseline file
// (scripts/qms-architecture-baseline.txt, rows: <rule>|<file>|<field-key>|<count>).
//
// Output is TSV, same contract as check-qms-source-rules.mjs:
//   BASELINE\t<rule>\t<location>\t<message>
//   VIOLATION\t<rule>\t<location>\t<message>

import { readFileSync } from 'node:fs';
import path from 'node:path';

const SCHEMA_REPO_PATH = 'apps/backend/prisma/schema.prisma';

const SCALAR_TYPES = new Set([
  'BigInt',
  'Boolean',
  'Bytes',
  'DateTime',
  'Decimal',
  'Float',
  'Int',
  'Json',
  'String',
]);

const BOOLEAN_PREFIX_PATTERN = /^(?:is|has)[A-Z]/u;

// Documented semantic-time exceptions (docs/data-contract.md §4.1 rule 4):
// `date`, `closeDate`, `deliveryDate`, `leaseUntil`, `validUntil`,
// `effectiveTime`, `createdAtCutoff`, `createdAtSnapshot`, ...
const DATETIME_EXCEPTION_PATTERN =
  /^(?:date|.*(?:Date|Until|Time|At(?:Cutoff|Snapshot)))$/u;

function parseArguments(argv) {
  const options = {
    baseline: '',
    printBaseline: false,
    root: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--print-baseline') {
      options.printBaseline = true;
      continue;
    }
    if (argument === '--baseline' || argument === '--root') {
      const value = argv[index + 1];
      if (!value) throw new Error(`Missing value for ${argument}`);
      index += 1;
      if (argument === '--baseline') options.baseline = value;
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
    // A missing baseline file is fine: nothing is grandfathered.
  }
  return baseline;
}

function parseSchema(schemaPath) {
  const lines = readFileSync(schemaPath, 'utf8').split(/\r?\n/u);
  const fields = [];
  let model = '';

  for (const [index, line] of lines.entries()) {
    const modelMatch = line.match(/^model\s+(\w+)\s*\{/u);
    if (modelMatch) {
      model = modelMatch[1];
      continue;
    }
    if (/^\}\s*$/u.test(line)) {
      model = '';
      continue;
    }
    if (!model) continue;

    const fieldMatch = line.match(/^ {2}(\w+)\s+(\w+)\??\s*(?:@|$)/u);
    if (!fieldMatch) continue;
    const type = fieldMatch[2];
    if (!SCALAR_TYPES.has(type)) continue;

    fields.push({
      line: index + 1,
      model,
      name: fieldMatch[1],
      type,
    });
  }

  return fields;
}

function collectFindings(schemaPath) {
  const repoPath = SCHEMA_REPO_PATH;
  const findings = [];

  for (const field of parseSchema(schemaPath)) {
    const key = `field-${field.name}`;
    if (field.type === 'Boolean' && !BOOLEAN_PREFIX_PATTERN.test(field.name)) {
      findings.push({
        rule: 'B-N1',
        key,
        line: field.line,
        message: `${field.model}.${field.name} is Boolean and must start with is/has (docs/data-contract.md §4.1 rule 3).`,
      });
    }
    if (
      field.type === 'DateTime' &&
      !field.name.includes('_') &&
      !field.name.endsWith('At') &&
      !DATETIME_EXCEPTION_PATTERN.test(field.name)
    ) {
      findings.push({
        rule: 'B-N2',
        key,
        line: field.line,
        message: `${field.model}.${field.name} is DateTime and must end with At or a documented date/until/time name (docs/data-contract.md §4.1 rule 4).`,
      });
    }
    if (field.name.includes('_')) {
      findings.push({
        rule: 'B-N3',
        key,
        line: field.line,
        message: `${field.model}.${field.name} must be camelCase (no underscores) (docs/data-contract.md §4.1 rule 1).`,
      });
    }
  }

  return { findings, repoPath };
}

function groupFindings(findings, repoPath) {
  const groups = new Map();
  for (const finding of findings) {
    const fingerprint = `${finding.rule}|${repoPath}|${finding.key}`;
    const group = groups.get(fingerprint) ?? [];
    group.push(finding);
    groups.set(fingerprint, group);
  }
  return groups;
}

function printRecord(fields) {
  process.stdout.write(
    `${fields.map((field) => String(field).replaceAll('\t', ' ')).join('\t')}\n`,
  );
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const rootDir = path.resolve(options.root);
  const schemaPath = path.join(rootDir, SCHEMA_REPO_PATH);
  const baseline = loadBaseline(options.baseline);

  let schemaText;
  try {
    schemaText = readFileSync(schemaPath, 'utf8');
  } catch {
    return; // No schema in this tree: nothing to check.
  }
  if (schemaText.trim() === '') return;

  const { findings, repoPath } = collectFindings(schemaPath);

  for (const [fingerprint, group] of groupFindings(findings, repoPath)) {
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
        first.rule,
        `${repoPath}:${first.line}`,
        `${suppressed}/${allowed} existing violations`,
      ]);
    }
    for (const finding of group.slice(allowed)) {
      printRecord([
        'VIOLATION',
        finding.rule,
        `${repoPath}:${finding.line}`,
        finding.message,
      ]);
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
