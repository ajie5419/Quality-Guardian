import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGETS = [
  {
    dir: path.join(ROOT, 'apps/backend/utils'),
    patterns: [
      {
        re: /const\s+STATUS_MAPPING_TABLE\s*:[\s\S]{0,800}WORK_ORDER_STATUS/g,
        reason: 'duplicate work-order status mapping table',
      },
      {
        re: /const\s+STATUS_MAPPING_TABLE\s*:[\s\S]{0,1200}AFTER_SALES_STATUS/g,
        reason: 'duplicate after-sales status mapping table',
      },
      {
        re: /const\s+TASK_DISPATCH_STATUS_SET\s*=\s*new\s+Set/g,
        reason: 'duplicate task-dispatch status set',
      },
      {
        re: /function\s+normalizeTaskDispatchText\s*\(/g,
        reason: 'duplicate task-dispatch text normalizer',
      },
      {
        re: /function\s+parseTaskDispatchInt\s*\(/g,
        reason: 'duplicate task-dispatch integer parser',
      },
      {
        re: /function\s+normalizeOptionalString\s*\(/g,
        reason: 'duplicate inspection-issue optional string normalizer',
      },
      {
        re: /function\s+normalizeOptionalNumber\s*\(/g,
        reason: 'duplicate inspection-issue optional number normalizer',
      },
      {
        re: /function\s+normalizeOptionalDate\s*\(/g,
        reason: 'duplicate inspection-issue optional date normalizer',
      },
      {
        re: /function\s+normalizeQualityLossUpdateText\s*\(/g,
        reason: 'duplicate quality-loss-update text normalizer',
      },
      {
        re: /function\s+parseOptionalFiniteNumber\s*\(/g,
        reason: 'duplicate quality-loss-update numeric parser',
      },
      {
        re: /function\s+parseOptionalDate\s*\(/g,
        reason: 'duplicate quality-loss-update date parser',
      },
    ],
  },
  {
    dir: path.join(ROOT, 'apps/web-antd/src/views/qms/work-order'),
    patterns: [
      {
        re: /const\s+STATUS_MAPPING_TABLE\s*:/g,
        reason: 'frontend duplicate work-order status mapping table',
      },
    ],
  },
  {
    dir: path.join(ROOT, 'apps/web-antd/src/views/qms/after-sales'),
    patterns: [
      {
        re: /statusMap:\s*\{[\s\S]{0,1000}待处理[\s\S]{0,1000}已取消[\s\S]{0,1000}\}/g,
        reason: 'frontend duplicate after-sales import status map',
      },
      {
        re: /const\s+statusMap\s*=\s*computed\s*\(\s*\(\)\s*=>\s*\{/g,
        reason: 'frontend duplicate after-sales status map',
      },
    ],
  },
  {
    dir: path.join(ROOT, 'apps/web-antd/src/views/qms/inspection/issues'),
    patterns: [
      {
        re: /const\s+STATUS_KEY_MAP\s*:\s*Record<string,\s*IssueStatus>/g,
        reason: 'frontend duplicate inspection-issue status map',
      },
    ],
  },
  {
    dir: path.join(ROOT, 'apps/backend/services'),
    patterns: [
      {
        re: /const\s+ISSUE_STATUS\s*=\s*\{/g,
        reason: 'backend duplicate issue tracking status constant map',
      },
      {
        re: /function\s+parseIssueStatus\s*\([\s\S]{0,600}String\(value\s*\|\|\s*''\)\.toUpperCase\(\)/g,
        reason: 'backend duplicate issue status parser implementation',
      },
      {
        re: /function\s+normalizeIssueStatus\s*\([\s\S]{0,400}toUpperCase\(\)/g,
        reason: 'backend duplicate issue status normalizer implementation',
      },
      {
        re: /function\s+deriveInspectionIssueStatus\s*\([\s\S]{0,800}statusSet\.has\('OPEN'\)/g,
        reason:
          'backend duplicate inspection issue status derivation implementation',
      },
    ],
  },
  {
    dir: path.join(ROOT, 'apps/web-antd/src/views/qms/reports'),
    patterns: [
      {
        re: /function\s+getIssueStatusColor\s*\([\s\S]{0,600}(?:'OPEN'|'IN_PROGRESS'|'RESOLVED'|'CLOSED'|"OPEN"|"IN_PROGRESS"|"RESOLVED"|"CLOSED")/g,
        reason: 'frontend duplicate report issue status color mapping',
      },
      {
        re: /function\s+getIssueStatusLabel\s*\([\s\S]{0,600}(?:'OPEN'|'IN_PROGRESS'|'RESOLVED'|'CLOSED'|"OPEN"|"IN_PROGRESS"|"RESOLVED"|"CLOSED")/g,
        reason: 'frontend duplicate report issue status label mapping',
      },
    ],
  },
  {
    dir: path.join(ROOT, 'apps/web-antd/src/views/qms/inspection/records'),
    patterns: [
      {
        re: /function\s+getIssueStatusLabel\s*\([\s\S]{0,600}(?:'OPEN'|'IN_PROGRESS'|'RESOLVED'|'CLOSED'|"OPEN"|"IN_PROGRESS"|"RESOLVED"|"CLOSED")/g,
        reason:
          'frontend duplicate inspection-record issue status label mapping',
      },
      {
        re: /function\s+getIssueStatusColor\s*\([\s\S]{0,600}(?:'OPEN'|'IN_PROGRESS'|'RESOLVED'|'CLOSED'|"OPEN"|"IN_PROGRESS"|"RESOLVED"|"CLOSED")/g,
        reason:
          'frontend duplicate inspection-record issue status color mapping',
      },
      {
        re: /function\s+normalizeIssueStatus\s*\([\s\S]{0,260}toUpperCase\(\)/g,
        reason:
          'frontend duplicate inspection-record issue status normalizer implementation',
      },
    ],
  },
  {
    dir: path.join(ROOT, 'apps/web-antd/src/views/qms/welder'),
    patterns: [
      {
        re: /function\s+mapIssueStatusLabel\s*\([\s\S]{0,600}(?:'OPEN'|'IN_PROGRESS'|'RESOLVED'|'CLOSED'|"OPEN"|"IN_PROGRESS"|"RESOLVED"|"CLOSED")/g,
        reason: 'frontend duplicate welder issue status label mapping',
      },
    ],
  },
];

const TARGET_EXTENSIONS = new Set(['.js', '.mjs', '.ts', '.tsx', '.vue']);

function walkFiles(dir, result = []) {
  if (!fs.existsSync(dir)) return result;
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

function findViolations(filePath, patterns) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rel = path.relative(ROOT, filePath);
  const violations = [];

  for (const { re, reason } of patterns) {
    for (const match of content.matchAll(re)) {
      const line = content.slice(0, match.index ?? 0).split('\n').length;
      violations.push(`${rel}:${line} ${reason}`);
    }
  }

  return violations;
}

function main() {
  const violations = [];

  for (const target of TARGETS) {
    const files = walkFiles(target.dir);
    for (const filePath of files) {
      violations.push(...findViolations(filePath, target.patterns));
    }
  }

  if (violations.length > 0) {
    console.error('[qgs-domain-boundary] FAIL');
    for (const item of violations) {
      console.error(`- ${item}`);
    }
    process.exit(1);
  }

  console.log('[qgs-domain-boundary] PASS');
}

main();
