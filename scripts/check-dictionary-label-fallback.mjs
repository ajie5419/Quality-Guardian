import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const WEB_QMS_DIR = path.join(ROOT, 'apps/web-antd/src/views/qms');
const TARGET_EXTENSIONS = new Set(['.ts', '.vue']);

function walkFiles(dir, result = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walkFiles(full, result);
      continue;
    }
    if (name.endsWith('.test.ts')) continue;
    if (name.endsWith('.spec.ts')) continue;
    const ext = path.extname(name);
    if (TARGET_EXTENSIONS.has(ext)) {
      result.push(full);
    }
  }
  return result;
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const issues = [];

  const exactPattern = /label:\s*item\.dictValue\b/g;
  for (const match of content.matchAll(exactPattern)) {
    const index = match.index ?? 0;
    const tail = content.slice(index, index + 180);
    const hasDictKeyFallback = /\|\|\s*item\.dictKey\b/.test(tail);
    if (hasDictKeyFallback) continue;
    const line = content.slice(0, index).split('\n').length;
    issues.push({
      file: path.relative(ROOT, filePath),
      line,
      snippet: 'label: item.dictValue',
    });
  }

  return issues;
}

function main() {
  const files = walkFiles(WEB_QMS_DIR);
  const allIssues = files.flatMap((file) => checkFile(file));

  if (allIssues.length > 0) {
    console.error('[dict-label-fallback] FAIL');
    for (const issue of allIssues) {
      console.error(
        `- ${issue.file}:${issue.line} uses "${issue.snippet}" without dictKey fallback`,
      );
    }
    process.exit(1);
  }

  console.log(`[dict-label-fallback] PASS scanned=${files.length}`);
}

main();
