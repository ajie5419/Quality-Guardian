import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const [key, value = ''] = item.slice(2).split('=');
    args.set(key, value);
  }
  return args;
}

function resolveScriptPath(scriptName: string) {
  const cwdPath = path.resolve(process.cwd(), 'scripts', scriptName);
  return cwdPath;
}

function parseBool(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === '') return fallback;
  const normalized = value.toLowerCase().trim();
  if (['1', 'on', 'true', 'y', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'n', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const reportLabel =
    String(args.get('reportLabel') || 'release').trim() || 'release';
  const allowUndecided = parseBool(args.get('allowUndecided'), false);
  const requireDeferredZero = parseBool(args.get('requireDeferredZero'), true);
  const requirePlannedZero = parseBool(args.get('requirePlannedZero'), true);
  const requireDecisionCoverageOne = parseBool(
    args.get('requireDecisionCoverageOne'),
    true,
  );

  const scriptPath = resolveScriptPath(
    'export-master-data-governance-backlog.ts',
  );
  const runArgs = [
    '--import',
    'tsx',
    scriptPath,
    `--reportLabel=${reportLabel}`,
  ];
  if (allowUndecided) {
    runArgs.push('--allowUndecided=true');
  }
  if (requirePlannedZero) {
    runArgs.push('--requirePlannedZero=true');
  }
  if (requireDeferredZero) {
    runArgs.push('--requireDeferredZero=true');
  }
  if (requireDecisionCoverageOne) {
    runArgs.push('--requireDecisionCoverageOne=true');
  }
  execFileSync(process.execPath, runArgs, {
    stdio: 'inherit',
  });
}

try {
  main();
} catch (error) {
  console.error('[check-master-data-governance-backlog] FAIL', error);
  process.exitCode = 1;
}
