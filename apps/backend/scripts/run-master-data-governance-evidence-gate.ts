import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import {
  getMasterDataGovernanceField,
  getMasterDataGovernanceFieldKeys,
  listMasterDataGovernanceFieldsByWave,
  listMasterDataGovernanceWaves,
} from '../core/master-data/governance-registry';

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const [key, value = ''] = item.slice(2).split('=');
    args.set(key, value);
  }
  return args;
}

function parseBool(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === '') return fallback;
  const normalized = value.toLowerCase().trim();
  if (['1', 'on', 'true', 'y', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'n', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function pickArg(args: Map<string, string>, key: string) {
  const value = String(args.get(key) || '').trim();
  if (!value) return null;
  return `--${key}=${value}`;
}

function resolveFieldKeys(args: Map<string, string>) {
  const fieldsArg = String(args.get('fields') || '').trim();
  if (fieldsArg) {
    return fieldsArg
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  const waveArg = String(args.get('wave') || '').trim();
  if (waveArg) {
    const wave = Number(waveArg);
    if (!listMasterDataGovernanceWaves().includes(wave)) {
      throw new TypeError(`INVALID_WAVE:${waveArg}`);
    }
    return listMasterDataGovernanceFieldsByWave(wave).map((field) => field.key);
  }
  return getMasterDataGovernanceFieldKeys();
}

function slugify(input: string) {
  return String(input || '')
    .trim()
    .replaceAll(/[^\w-]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .toLowerCase();
}

function resolveReportLabel(args: Map<string, string>) {
  const explicit = slugify(args.get('reportLabel'));
  if (explicit) return explicit;
  const waveArg = String(args.get('wave') || '').trim();
  if (waveArg) return `release-wave${waveArg}`;
  const fieldsArg = String(args.get('fields') || '').trim();
  if (fieldsArg) return `fields-${slugify(fieldsArg)}`;
  return 'all-fields';
}

function hasCanonicalField(fieldKeys: string[]) {
  return fieldKeys.some((fieldKey) =>
    Boolean(getMasterDataGovernanceField(fieldKey)?.canonical),
  );
}

function runScript(scriptName: string, args: string[]) {
  const scriptPath = path.resolve(process.cwd(), 'scripts', scriptName);
  execFileSync(process.execPath, ['--import', 'tsx', scriptPath, ...args], {
    stdio: 'inherit',
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fieldKeys = resolveFieldKeys(args);
  const reportLabel = resolveReportLabel(args);
  const runSeed = parseBool(args.get('seed'), true);
  const runBackfill = parseBool(args.get('backfill'), true);
  const runAudit = parseBool(args.get('audit'), true);
  const skipRun = parseBool(args.get('skipRun'), false);
  const failOnAuditError = parseBool(args.get('failOnAuditError'), true);
  const hasCanonical = hasCanonicalField(fieldKeys);
  const backfillBatchSizeArg = pickArg(args, 'backfillBatchSize');
  const backfillMaxRowsPerTableArg = pickArg(args, 'backfillMaxRowsPerTable');
  const backfillMaxBatchesPerTableArg = pickArg(
    args,
    'backfillMaxBatchesPerTable',
  );
  const backfillStartAfterIdsByTableArg = pickArg(
    args,
    'backfillStartAfterIdsByTable',
  );

  if (!skipRun) {
    const runGovernanceArgs = [
      `--fields=${fieldKeys.join(',')}`,
      `--seed=${String(runSeed)}`,
      `--backfill=${String(runBackfill)}`,
      `--audit=${String(runAudit)}`,
      `--failOnAuditError=${String(failOnAuditError)}`,
      '--writeReport=true',
      `--reportLabel=${reportLabel}`,
    ];
    if (backfillBatchSizeArg) runGovernanceArgs.push(backfillBatchSizeArg);
    if (backfillMaxRowsPerTableArg)
      runGovernanceArgs.push(backfillMaxRowsPerTableArg);
    if (backfillMaxBatchesPerTableArg)
      runGovernanceArgs.push(backfillMaxBatchesPerTableArg);
    if (backfillStartAfterIdsByTableArg)
      runGovernanceArgs.push(backfillStartAfterIdsByTableArg);
    runScript('run-master-data-governance.ts', runGovernanceArgs);
  }

  const reportArg = String(args.get('report') || '').trim();
  const reportDirArg = String(args.get('reportDir') || '').trim();

  const strictArgs = [
    `--fields=${fieldKeys.join(',')}`,
    '--requireAuditExecuted=true',
    `--requireSeedExecutedForCanonical=${String(hasCanonical && runSeed)}`,
    `--requireBackfillExecutedForCanonical=${String(hasCanonical && runBackfill)}`,
    `--reportLabel=${reportLabel}`,
  ];
  if (reportArg) {
    strictArgs.push(`--report=${reportArg}`);
  }
  if (reportDirArg) {
    strictArgs.push(`--reportDir=${reportDirArg}`);
  }
  runScript('check-master-data-governance-report.ts', strictArgs);
}

main().catch((error: unknown) => {
  console.error('[run-master-data-governance-evidence-gate] failed', error);
  process.exitCode = 1;
});
