import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { MasterDataGovernanceKernel } from '../core/master-data/governance-kernel';
import {
  getMasterDataGovernanceField,
  getMasterDataGovernanceFieldKeys,
  listMasterDataGovernanceFieldsByWave,
  listMasterDataGovernanceWaves,
} from '../core/master-data/governance-registry';
import prisma from '../utils/prisma';

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

function parsePositiveInteger(value: string | undefined) {
  const normalized = String(value || '').trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`INVALID_POSITIVE_INTEGER:${value}`);
  }
  return Math.floor(parsed);
}

function resolveConfigKeys(args: Map<string, string>) {
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
      throw new Error(`INVALID_WAVE:${waveArg}`);
    }
    return listMasterDataGovernanceFieldsByWave(wave).map((field) => field.key);
  }
  return getMasterDataGovernanceFieldKeys();
}

function parseStartAfterIdsByTable(input: string | undefined) {
  const raw = String(input || '').trim();
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('INVALID_JSON:backfillStartAfterIdsByTable');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('INVALID_OBJECT:backfillStartAfterIdsByTable');
  }
  const map: Record<string, null | string> = {};
  for (const [key, value] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    const table = String(key || '').trim();
    if (!table) continue;
    const cursor = String(value || '').trim();
    map[table] = cursor || null;
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

function requiresDerivedRuleFreeze(configKeys: string[]) {
  return configKeys.some((fieldKey) =>
    Boolean(getMasterDataGovernanceField(fieldKey)?.requiresDerivedRuleFreeze),
  );
}

function enforceDerivedRuleFreeze() {
  const cwdScriptPath = path.resolve(
    process.cwd(),
    'scripts',
    'check-master-data-derived-rules.ts',
  );
  const scriptPath = existsSync(cwdScriptPath)
    ? cwdScriptPath
    : path.resolve(
        resolveRepoRoot(),
        'apps',
        'backend',
        'scripts',
        'check-master-data-derived-rules.ts',
      );
  execFileSync(process.execPath, ['--import', 'tsx', scriptPath], {
    stdio: 'inherit',
  });
}

function resolveRepoRoot() {
  const cwd = process.cwd();
  const backendSuffix = `${path.sep}apps${path.sep}backend`;
  if (cwd.endsWith(backendSuffix)) {
    return path.resolve(cwd, '..', '..');
  }
  return cwd;
}

function slugify(input: string) {
  return String(input || '')
    .trim()
    .replaceAll(/[^\w-]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .toLowerCase();
}

function buildFieldEvidence(
  fieldKey: string,
  result: Awaited<
    ReturnType<typeof MasterDataGovernanceKernel.runGovernanceByFields>
  >[number],
  options: {
    runAudit: boolean;
    runBackfill: boolean;
    runSeed: boolean;
  },
) {
  const field = getMasterDataGovernanceField(fieldKey);
  if (!field) {
    throw new TypeError(`INVALID_FIELD:${fieldKey}`);
  }
  const hasCanonical = Boolean(field.canonical);
  let seed:
    | { output: unknown; status: 'executed' }
    | { reason: string; status: 'skipped' };
  if (!options.runSeed) {
    seed = {
      status: 'skipped',
      reason: 'disabled by run option',
    };
  } else if (!hasCanonical) {
    seed = {
      status: 'skipped',
      reason: 'non-canonical field',
    };
  } else if (result.seed) {
    seed = {
      status: 'executed',
      output: result.seed,
    };
  } else {
    seed = {
      status: 'skipped',
      reason: 'seed not returned by kernel',
    };
  }

  let backfill:
    | { output: unknown; status: 'executed' }
    | { reason: string; status: 'skipped' };
  if (!options.runBackfill) {
    backfill = {
      status: 'skipped',
      reason: 'disabled by run option',
    };
  } else if (field.backfillPolicy !== 'canonical-id') {
    backfill = {
      status: 'skipped',
      reason: 'field backfill policy is none',
    };
  } else if (result.backfill) {
    backfill = {
      status: 'executed',
      output: result.backfill,
    };
  } else {
    backfill = {
      status: 'skipped',
      reason: 'backfill not returned by kernel',
    };
  }

  const audit = options.runAudit
    ? {
        status: 'executed' as const,
        output: result.audit,
      }
    : {
        status: 'skipped' as const,
        reason: 'disabled by run option',
      };

  return {
    fieldKey,
    rolloutWave: field.rolloutWave,
    audit,
    backfill,
    seed,
  };
}

async function writeGovernanceEvidenceReport(payload: {
  configKeys: string[];
  options: {
    backfillBatchSize: null | number;
    backfillMaxBatchesPerTable: null | number;
    backfillMaxRowsPerTable: null | number;
    backfillStartAfterIdsByTable: null | Record<string, null | string>;
    failOnAuditError: boolean;
    runAudit: boolean;
    runBackfill: boolean;
    runSeed: boolean;
  };
  reportDir?: string;
  reportLabel: string;
  results: Awaited<
    ReturnType<typeof MasterDataGovernanceKernel.runGovernanceByFields>
  >;
}) {
  const repoRoot = resolveRepoRoot();
  const timestamp = new Date();
  const reportId = `${timestamp.toISOString()}-${slugify(payload.reportLabel || 'manual')}`;
  const reportDir =
    payload.reportDir && payload.reportDir.trim()
      ? path.resolve(payload.reportDir)
      : path.resolve(repoRoot, 'tmp', 'master-data-governance', 'reports');
  await fs.mkdir(reportDir, { recursive: true });
  const evidenceByField = payload.configKeys.map((fieldKey) => {
    const result = payload.results.find((item) => item.fieldKey === fieldKey);
    if (!result) {
      throw new Error(`MISSING_RESULT:${fieldKey}`);
    }
    return buildFieldEvidence(fieldKey, result, payload.options);
  });
  const report = {
    generatedAt: timestamp.toISOString(),
    reportId,
    reportLabel: payload.reportLabel,
    configKeys: payload.configKeys,
    options: payload.options,
    fields: evidenceByField,
  };

  const fileName = `governance-report-${timestamp
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')}-${slugify(payload.reportLabel || 'manual')}.json`;
  const reportPath = path.join(reportDir, fileName);
  await fs.writeFile(
    reportPath,
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  return reportPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configKeys = resolveConfigKeys(args);
  if (configKeys.length === 0) {
    throw new Error('NO_FIELDS_SELECTED');
  }
  if (requiresDerivedRuleFreeze(configKeys)) {
    enforceDerivedRuleFreeze();
  }

  const runSeed = parseBool(args.get('seed'), true);
  const runBackfill = parseBool(args.get('backfill'), true);
  const runAudit = parseBool(args.get('audit'), true);
  const failOnAuditError = parseBool(args.get('failOnAuditError'), true);
  const backfillBatchSize = parsePositiveInteger(args.get('backfillBatchSize'));
  const backfillMaxRowsPerTable = parsePositiveInteger(
    args.get('backfillMaxRowsPerTable'),
  );
  const backfillMaxBatchesPerTable = parsePositiveInteger(
    args.get('backfillMaxBatchesPerTable'),
  );
  const backfillStartAfterIdsByTable = parseStartAfterIdsByTable(
    args.get('backfillStartAfterIdsByTable'),
  );
  const writeReport = parseBool(args.get('writeReport'), true);
  const reportLabel =
    String(args.get('reportLabel') || 'manual').trim() || 'manual';
  const reportDir = String(args.get('reportDir') || '').trim();

  const results = await MasterDataGovernanceKernel.runGovernanceByFields({
    backfillBatchSize,
    backfillMaxBatchesPerTable,
    backfillMaxRowsPerTable,
    backfillStartAfterIdsByTable,
    configKeys,
    runSeed,
    runBackfill,
    runAudit,
    failOnAuditError,
  });

  const summary = {
    configKeys,
    options: {
      backfillBatchSize: backfillBatchSize || null,
      backfillMaxBatchesPerTable: backfillMaxBatchesPerTable || null,
      backfillMaxRowsPerTable: backfillMaxRowsPerTable || null,
      backfillStartAfterIdsByTable: backfillStartAfterIdsByTable || null,
      failOnAuditError,
      runAudit,
      runBackfill,
      runSeed,
    },
    results,
  };

  console.warn('[run-master-data-governance] result');
  console.warn(JSON.stringify(summary, null, 2));

  if (writeReport) {
    const reportPath = await writeGovernanceEvidenceReport({
      configKeys,
      options: {
        backfillBatchSize: backfillBatchSize || null,
        backfillMaxBatchesPerTable: backfillMaxBatchesPerTable || null,
        backfillMaxRowsPerTable: backfillMaxRowsPerTable || null,
        backfillStartAfterIdsByTable: backfillStartAfterIdsByTable || null,
        failOnAuditError,
        runAudit,
        runBackfill,
        runSeed,
      },
      reportLabel,
      reportDir,
      results,
    });
    console.warn('[run-master-data-governance] report');
    console.warn(JSON.stringify({ reportPath }, null, 2));
  }
}

main()
  .catch((error: unknown) => {
    console.error('[run-master-data-governance] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
