import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = [
  path.join(ROOT, 'apps/backend/api'),
  path.join(ROOT, 'apps/backend/services'),
];
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

function hasDetailsTemplate(block) {
  return /detailsTemplate\s*:/.test(block);
}

function hasRawDetails(block) {
  return /details\s*:/.test(block);
}

function extractObjectLiteral(content, startIndex) {
  const openIndex = content.indexOf('{', startIndex);
  if (openIndex === -1) return null;
  let depth = 0;
  for (let i = openIndex; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return content.slice(openIndex, i + 1);
      }
    }
  }
  return null;
}

function findViolations(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rel = path.relative(ROOT, filePath);
  const violations = [];
  const callPatterns = [
    'recordBusinessAuditLog(',
    'SystemLogService.recordAuditLog(',
  ];

  for (const callPattern of callPatterns) {
    let from = 0;
    while (from < content.length) {
      const start = content.indexOf(callPattern, from);
      if (start === -1) break;
      const block = extractObjectLiteral(content, start + callPattern.length);
      if (block && hasRawDetails(block) && !hasDetailsTemplate(block)) {
        const line = content.slice(0, start).split('\n').length;
        violations.push(
          `${rel}:${line} uses raw details in ${callPattern.replace('(', '')}`,
        );
      }
      from = start + callPattern.length;
    }
  }

  return violations;
}

function main() {
  const files = SCAN_DIRS.flatMap((dir) => walkFiles(dir));
  const violations = files.flatMap((filePath) => findViolations(filePath));

  if (violations.length > 0) {
    console.error('[audit-template-governance] FAIL');
    for (const item of violations) {
      console.error(`- ${item}`);
    }
    process.exit(1);
  }

  console.log(`[audit-template-governance] PASS scanned=${files.length}`);
}

main();
