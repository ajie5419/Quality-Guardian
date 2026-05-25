import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const backendDir = path.join(ROOT, 'apps', 'backend');

const targetFiles = [
  path.join(backendDir, 'api'),
  path.join(backendDir, 'services'),
  path.join(backendDir, 'utils'),
  path.join(backendDir, 'modules'),
  path.join(backendDir, 'scripts'),
];

const skipFiles = new Set([
  path.join(backendDir, 'core', 'master-data', 'governance-kernel.ts'),
  path.join(backendDir, 'core', 'master-data', 'governance-registry.ts'),
  path.join(backendDir, 'core', 'master-data', 'governance-write.ts'),
  path.join(backendDir, 'services', 'master-data-rename.service.ts'),
  path.join(backendDir, 'utils', 'master-data-governance-kernel.ts'),
  path.join(backendDir, 'utils', 'master-data-governance-registry.ts'),
  path.join(backendDir, 'utils', 'master-data-governance-write.ts'),
]);

function escapeRegex(input) {
  return input.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function parseGovernanceTokensFromRegistry() {
  const registryPath = path.join(
    backendDir,
    'core',
    'master-data',
    'governance-registry.ts',
  );
  const text = fs.readFileSync(registryPath, 'utf8');
  const blocks = [...text.matchAll(/targets:\s*\[([\s\S]*?)\],/g)].map(
    (match) => String(match[1] || ''),
  );
  const tokens = new Set();
  for (const block of blocks) {
    for (const match of block.matchAll(
      /(?:nameColumn|idColumn):\s*'([^']+)'/g,
    )) {
      const value = String(match[1] || '').trim();
      if (!value) continue;
      if (value === 'id') continue;
      tokens.add(value);
    }
  }
  return [...tokens];
}

const forbiddenTokens = parseGovernanceTokensFromRegistry().map(
  (token) => `${token}:`,
);

function listChangedFiles() {
  const commands = [
    'git diff --name-only --diff-filter=ACMR -- apps/backend/**/*.ts',
    'git diff --cached --name-only --diff-filter=ACMR -- apps/backend/**/*.ts',
    'git ls-files --others --exclude-standard -- apps/backend/**/*.ts',
  ];

  const files = new Set();
  for (const cmd of commands) {
    try {
      const output = execSync(cmd, {
        cwd: ROOT,
        stdio: 'pipe',
        encoding: 'utf8',
      });
      output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => files.add(path.resolve(ROOT, line)));
    } catch {
      // Ignore and continue to next command.
    }
  }
  return [...files];
}

function listAddedLineNumbers(relPath) {
  const commands = [
    `git diff -U0 -- "${relPath}"`,
    `git diff --cached -U0 -- "${relPath}"`,
  ];

  const lineSet = new Set();
  for (const cmd of commands) {
    try {
      const output = execSync(cmd, {
        cwd: ROOT,
        stdio: 'pipe',
        encoding: 'utf8',
      });
      const lines = output.split('\n');
      for (const line of lines) {
        if (!line.startsWith('@@')) continue;
        const match = line.match(/\+(\d+)(?:,(\d+))?/);
        if (!match) continue;
        const start = Number(match[1]);
        const count = Number(match[2] || '1');
        for (let i = 0; i < count; i += 1) {
          lineSet.add(start + i);
        }
      }
    } catch {
      // Ignore and continue.
    }
  }
  return lineSet;
}

function isOnlyTypingLine(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('type ') ||
    trimmed.startsWith('interface ') ||
    trimmed.startsWith('export type ') ||
    trimmed.startsWith('export interface ') ||
    trimmed.includes('?:') ||
    trimmed.includes(': string') ||
    trimmed.includes(': null') ||
    trimmed.includes(': number') ||
    trimmed.includes(': boolean')
  );
}

function hasGovernanceHelperUsage(line) {
  return (
    line.includes('buildGoverned') ||
    line.includes('MasterDataGovernanceKernel') ||
    line.includes('getMasterDataGovernanceField') ||
    line.includes('governance-allow-direct-name-id')
  );
}

function hasFrozenImportViolation(line) {
  return (
    line.includes('master-data-governance-kernel') ||
    line.includes('master-data-governance-registry') ||
    line.includes('master-data-governance-write')
  );
}

function isGovernanceHelperContext(lines, index) {
  const start = Math.max(0, index - 12);
  const end = Math.min(lines.length - 1, index + 2);
  for (let cursor = start; cursor <= end; cursor += 1) {
    if (hasGovernanceHelperUsage(lines[cursor])) {
      return true;
    }
  }
  return false;
}

const changedFiles = listChangedFiles().filter((file) => {
  if (!file.startsWith(backendDir)) return false;
  if (!file.endsWith('.ts')) return false;
  if (file.endsWith('.test.ts')) return false;
  return targetFiles.some((base) => file.startsWith(base));
});

const violations = [];

for (const file of changedFiles) {
  if (!fs.existsSync(file)) continue;
  if (skipFiles.has(file)) continue;
  const rel = path.relative(ROOT, file);
  const addedLines = listAddedLineNumbers(rel);
  if (addedLines.size === 0) continue;
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (!addedLines.has(lineNumber)) return;
    if (hasFrozenImportViolation(line)) {
      violations.push(
        `${rel}:${index + 1} forbidden governance import alias; use core/master-data/governance-*`,
      );
      return;
    }
    if (hasGovernanceHelperUsage(line)) return;
    if (isGovernanceHelperContext(lines, index)) return;
    if (isOnlyTypingLine(line)) return;
    for (const token of forbiddenTokens) {
      const regex = new RegExp(`(^|[\\s{,])${escapeRegex(token)}\\s*`, 'u');
      if (regex.test(line)) {
        violations.push(
          `${rel}:${index + 1} direct field mapping token "${token}" is forbidden; route via governance kernel`,
        );
      }
    }
  });
}

if (violations.length > 0) {
  console.error('[check-master-data-governance] FAIL');
  for (const item of violations) {
    console.error(`- ${item}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `[check-master-data-governance] PASS changedFiles=${changedFiles.length}`,
  );
}
