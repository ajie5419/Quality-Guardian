import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const GENERIC_HELPER_NAME = 'buildGovernedWriteFieldsForTable';

function resolveBackendRoot() {
  const cwd = process.cwd();
  const backendFromRoot = path.resolve(cwd, 'apps', 'backend');
  if (fs.existsSync(path.join(backendFromRoot, 'package.json'))) {
    return backendFromRoot;
  }
  if (fs.existsSync(path.join(cwd, 'package.json'))) {
    return cwd;
  }
  throw new Error('BACKEND_ROOT_NOT_FOUND');
}

function walkTsFiles(baseDir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTsFiles(fullPath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.ts')) continue;
    if (entry.name.endsWith('.test.ts')) continue;
    files.push(fullPath);
  }
  return files;
}

function parseSpecializedHelperNames(writeHelperSource: string) {
  const helperNames = [
    ...writeHelperSource.matchAll(/export function (buildGoverned\w+)\s*\(/g),
  ]
    .map((match) => String(match[1] || '').trim())
    .filter(Boolean);

  return [...new Set(helperNames)]
    .filter(
      (name) =>
        name !== GENERIC_HELPER_NAME &&
        /^buildGoverned\w+WriteFields$/u.test(name),
    )
    .sort((a, b) => a.localeCompare(b));
}

function escapeRegex(input: string) {
  return input.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function findOccurrencesByLine(
  text: string,
  helperNames: string[],
): Array<{ helperName: string; line: number; snippet: string }> {
  const lines = text.split('\n');
  const occurrences: Array<{
    helperName: string;
    line: number;
    snippet: string;
  }> = [];
  for (const [index, line] of lines.entries()) {
    for (const helperName of helperNames) {
      const regex = new RegExp(`\\b${escapeRegex(helperName)}\\b`, 'u');
      if (!regex.test(line)) continue;
      occurrences.push({
        helperName,
        line: index + 1,
        snippet: line.trim(),
      });
    }
  }
  return occurrences;
}

async function main() {
  const backendRoot = resolveBackendRoot();
  const writeHelperPath = path.join(
    backendRoot,
    'core',
    'master-data',
    'governance-write.ts',
  );
  const writeHelperSource = fs.readFileSync(writeHelperPath, 'utf8');
  const specializedHelpers = parseSpecializedHelperNames(writeHelperSource);

  const scanRoots = ['api', 'modules', 'services', 'utils'].map((folder) =>
    path.join(backendRoot, folder),
  );
  const files = scanRoots.flatMap((dir) => walkTsFiles(dir));
  const skipFiles = new Set([writeHelperPath]);

  const violations: Array<{
    file: string;
    helperName: string;
    line: number;
    snippet: string;
  }> = [];

  for (const filePath of files) {
    if (skipFiles.has(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    const occurrences = findOccurrencesByLine(content, specializedHelpers);
    for (const occurrence of occurrences) {
      violations.push({
        file: path.relative(backendRoot, filePath),
        helperName: occurrence.helperName,
        line: occurrence.line,
        snippet: occurrence.snippet,
      });
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    genericHelper: GENERIC_HELPER_NAME,
    specializedHelpers: specializedHelpers.length,
    scannedFiles: files.length,
    violations: violations.length,
    samples: violations.slice(0, 20),
    guidance:
      'Business write paths must call buildGovernedWriteFieldsForTable(targetTable, input). Specialized helpers are compatibility-only and must not be used outside master-data-governance-write.ts.',
  };

  console.warn('[check-master-data-generic-write-entry] result');
  console.warn(JSON.stringify(summary, null, 2));

  if (violations.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error('[check-master-data-generic-write-entry] failed', error);
  process.exitCode = 1;
});
