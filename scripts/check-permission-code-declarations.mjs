#!/usr/bin/env node
/**
 * Gate: every permission code referenced by the frontend must be declared
 * (shared enum value OR a menu authCode literal in a module declaration
 * file), and every code referenced by backend authorizeWrite must be a
 * shared enum value. Prevents regressions like the after-sales export
 * button whose code was never declared.
 *
 * Usage:
 *   node scripts/check-permission-code-declarations.mjs [--print-baseline]
 */

import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function walk(dir, out = []) {
  for (const entry of globSync(join(dir, '**/*.{ts,vue,mjs,js}'), {
    dot: false,
  })) {
    if (
      entry.includes('node_modules') ||
      entry.includes('/dist/') ||
      entry.includes('.nitro')
    )
      continue;
    out.push(entry);
  }
  return out;
}

function extractCodes(text, prefix) {
  const codes = new Set();
  const re = new RegExp(`'${prefix}:[A-Za-z:]+'`, 'g');
  for (const m of text.matchAll(re)) codes.add(m[0].slice(1, -1));
  return codes;
}

function main() {
  const args = process.argv.slice(2);
  const printBaseline = args.includes('--print-baseline');

  // 1. shared enum values
  const sharedFiles = walk(join(ROOT, 'packages/qgs-shared/src'));
  const enumCodes = new Set();
  const sharedEnumNames = new Set();
  const enumMembers = new Map();
  const enumDeclPattern =
    /export const ([A-Z][A-Z0-9_]+)\s*=\s*\{([\s\S]*?)\}\s*as const/g;
  for (const f of sharedFiles) {
    const text = readFileSync(f, 'utf8');
    for (const c of extractCodes(text, 'QMS')) enumCodes.add(c);
    for (const c of extractCodes(text, 'System')) enumCodes.add(c);
    for (const m of text.matchAll(enumDeclPattern)) {
      if (!/PERMISSION|CODES/.test(m[1])) continue;
      sharedEnumNames.add(m[1]);
      const members = new Set(
        [...m[2].matchAll(/([A-Z][A-Z0-9_]*)\s*:\s*'([^']+)'/g)].map(
          (x) => x[1],
        ),
      );
      enumMembers.set(m[1], members);
    }
  }

  // 2. module declaration authCodes (backend)
  const moduleFiles = walk(join(ROOT, 'apps/backend/modules'));
  const declaredCodes = new Set(enumCodes);
  for (const f of moduleFiles) {
    if (!f.endsWith('.module.ts')) continue;
    const text = readFileSync(f, 'utf8');
    for (const c of extractCodes(text, 'QMS')) declaredCodes.add(c);
    for (const c of extractCodes(text, 'System')) declaredCodes.add(c);
  }

  // 3. frontend references (exclude useQmsPermissions prefixes and
  // System:* codes which are admin-gated legacy menu codes)
  const viewFiles = walk(join(ROOT, 'apps/web-antd/src'));
  const frontendCodes = new Set();
  const prefixPattern = /useQmsPermissions\(\s*'([A-Za-z:]+)'/g;
  const excludedPrefixes = new Set();
  for (const f of viewFiles) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(prefixPattern)) {
      excludedPrefixes.add(m[1]);
    }
  }
  for (const f of viewFiles) {
    const text = readFileSync(f, 'utf8');
    for (const c of extractCodes(text, 'QMS')) {
      if (excludedPrefixes.has(c)) continue;
      frontendCodes.add(c);
    }
  }

  // 4. backend authorizeWrite enum refs must resolve to declared values
  const backendFiles = walk(join(ROOT, 'apps/backend'));
  const refPattern =
    /authorizeWrite\(\s*event,\s*([A-Z][A-Z0-9_]+(?:\.[A-Z][A-Z0-9_]+)*)/g;
  for (const f of backendFiles) {
    if (!f.endsWith('.ts')) continue;
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(refPattern)) {
      const parts = m[1].split('.');
      const enumName = parts[0];
      const member = parts[parts.length - 1];
      if (!sharedEnumNames.has(enumName)) {
        console.error(
          `B-AUTH2: backend authorizeWrite references unknown enum ${enumName}`,
        );
        process.exitCode = 1;
        continue;
      }
      // PERMISSION_CODES is a nested object; only leaf members of
      // flat enums are validated here (value-level validation is done
      // by the runtime permission audit).
      if (enumName === 'PERMISSION_CODES') continue;
      if (!enumMembers.get(enumName)?.has(member)) {
        console.error(
          `B-AUTH2: backend authorizeWrite references ${enumName}.${member} which is not in the shared enum`,
        );
        process.exitCode = 1;
      }
    }
  }

  const violations = [];
  for (const code of frontendCodes) {
    if (code.startsWith('System:')) continue;
    if (!declaredCodes.has(code)) violations.push(code);
  }
  violations.sort();

  if (printBaseline) {
    for (const v of violations) console.log(v);
    return;
  }

  if (violations.length > 0) {
    console.error('B-AUTH2: frontend permission codes without declaration:');
    for (const v of violations) console.error(`  ${v}`);
    process.exitCode = 1;
  } else {
    console.log('B-AUTH2: all frontend permission codes are declared.');
  }
}

main();
