import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_DIR = path.join(ROOT, 'apps/backend/api/qms');
const TARGET_EXTENSIONS = new Set(['.js', '.mjs', '.ts', '.tsx']);

function walkFiles(dir, result = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walkFiles(full, result);
      continue;
    }
    if (!TARGET_EXTENSIONS.has(path.extname(name))) continue;
    result.push(full);
  }
  return result;
}

function findViolations(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rel = path.relative(ROOT, filePath);
  const violations = [];

  const rawSuccessPattern = /return\s*\{[\s\S]{0,160}?\bsuccess\s*:/g;
  for (const match of content.matchAll(rawSuccessPattern)) {
    const index = match.index ?? 0;
    const line = content.slice(0, index).split('\n').length;
    violations.push(`${rel}:${line} raw success envelope is forbidden`);
  }

  const rawCodePattern = /return\s*\{[\s\S]{0,160}?\bcode\s*:/g;
  for (const match of content.matchAll(rawCodePattern)) {
    const index = match.index ?? 0;
    const line = content.slice(0, index).split('\n').length;
    violations.push(`${rel}:${line} raw code envelope is forbidden`);
  }

  return violations;
}

function main() {
  const files = walkFiles(SCAN_DIR);
  const violations = files.flatMap((filePath) => findViolations(filePath));

  if (violations.length > 0) {
    console.error('[qms-api-envelope] FAIL');
    for (const item of violations) {
      console.error(`- ${item}`);
    }
    process.exit(1);
  }

  console.log(`[qms-api-envelope] PASS scanned=${files.length}`);
}

main();
