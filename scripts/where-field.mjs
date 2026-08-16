#!/usr/bin/env node
/**
 * Field impact lookup: where a field name is referenced across the project.
 *
 * Usage: node scripts/where-field.mjs <fieldName> [--root <dir>]
 *
 * Searches (case-insensitive, both camelCase and snake_case forms):
 *   1. governed-fields registry   (apps/backend/utils/master-data-fields.ts)
 *   2. Prisma schema              (apps/backend/prisma/schema.prisma)
 *   3. backend source             (apps/backend/modules + api, .ts)
 *   4. shared DTO                 (packages/qgs-shared/src)
 *   5. frontend source            (apps/web-antd/src, .ts/.vue)
 *   6. weapp source               (apps/weapp/src, .ts/.vue)
 *
 * Output groups matches by layer and counts them; prints file paths.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const [fieldArg, , rootArg] = process.argv.slice(2);
if (!fieldArg) {
  console.error('usage: node scripts/where-field.mjs <fieldName> [--root <dir>]');
  process.exit(1);
}

const root = rootArg === '--root' ? process.argv[5] || process.cwd() : process.cwd();
const field = fieldArg;
const variants = new Set([field]);
// snake_case form of a camelCase field (auditCompanyName -> audit_company_name)
const snake = field.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
if (snake !== field.toLowerCase()) variants.add(snake);
variants.add(field.toLowerCase());

const FILE_PATTERNS = /\.(ts|tsx|vue|prisma)$/u;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.turbo', 'coverage']);

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (FILE_PATTERNS.test(entry.name)) {
      out.push(full);
    }
  }
}

function collectFiles(relDir) {
  const abs = path.join(root, relDir);
  const out = [];
  try {
    if (statSync(abs).isDirectory()) walk(abs, out);
  } catch {
    /* missing dir */
  }
  return out;
}

function matches(line) {
  const lower = line.toLowerCase();
  for (const v of variants) {
    if (lower.includes(v)) return true;
  }
  return false;
}

function scan(relDirs, label) {
  const files = [];
  for (const d of relDirs) files.push(...collectFiles(d));
  const hits = [];
  for (const f of files) {
    let text = '';
    try {
      text = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    const count = text.split('\n').filter(matches).length;
    if (count > 0) hits.push({ path: path.relative(root, f), count });
  }
  hits.sort((a, b) => b.count - a.count);
  console.log(`\n== ${label} ==`);
  if (hits.length === 0) {
    console.log('  (no matches)');
    return hits.length;
  }
  for (const h of hits) {
    console.log(`  ${h.count}x ${h.path}`);
  }
  return hits.length;
}

console.log(`Field impact lookup: "${field}" (variants: ${[...variants].join(', ')})\nroot: ${root}`);

let total = 0;
total += scan(['apps/backend/utils'], '1. Governance registry (master-data-fields)');
total += scan(['apps/backend/prisma'], '2. Prisma schema');
total += scan(['apps/backend/modules', 'apps/backend/api', 'apps/backend/middleware', 'apps/backend/utils'], '3. Backend source');
total += scan(['packages/qgs-shared/src'], '4. Shared DTO / enums');
total += scan(['apps/web-antd/src'], '5. Frontend (web-antd)');
total += scan(['apps/weapp/src'], '6. WeApp');

console.log(`\nTotal matches: ${total}`);
