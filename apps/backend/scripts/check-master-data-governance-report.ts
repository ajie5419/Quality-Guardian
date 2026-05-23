import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  getMasterDataGovernanceField,
  getMasterDataGovernanceFieldKeys,
  listMasterDataGovernanceFieldsByWave,
  listMasterDataGovernanceWaves,
} from '../utils/master-data-governance-registry';

interface FieldEvidence {
  audit: {
    output?: unknown;
    reason?: string;
    status: 'executed' | 'skipped';
  };
  backfill: {
    output?: unknown;
    reason?: string;
    status: 'executed' | 'skipped';
  };
  fieldKey: string;
  seed: {
    output?: unknown;
    reason?: string;
    status: 'executed' | 'skipped';
  };
}

interface GovernanceReport {
  configKeys: string[];
  fields: FieldEvidence[];
  generatedAt: string;
  options: {
    backfillBatchSize?: null | number;
    backfillMaxBatchesPerTable?: null | number;
    backfillMaxRowsPerTable?: null | number;
    backfillStartAfterIdsByTable?: null | Record<string, null | string>;
    failOnAuditError: boolean;
    runAudit: boolean;
    runBackfill: boolean;
    runSeed: boolean;
  };
  reportId: string;
  reportLabel: string;
}

interface ValidationOptions {
  requireAuditExecuted: boolean;
  requireBackfillExecutedForCanonical: boolean;
  requireSeedExecutedForCanonical: boolean;
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const [key, value = ''] = item.slice(2).split('=');
    args.set(key, value);
  }
  return args;
}

function resolveRepoRoot() {
  const cwd = process.cwd();
  const backendSuffix = `${path.sep}apps${path.sep}backend`;
  if (cwd.endsWith(backendSuffix)) {
    return path.resolve(cwd, '..', '..');
  }
  return cwd;
}

async function pickLatestReport(reportDir: string, reportLabel: string) {
  const entries = await fs.readdir(reportDir, { withFileTypes: true });
  const files = entries
    .filter((item) => item.isFile() && item.name.endsWith('.json'))
    .map((item) => item.name)
    .filter((name) => {
      if (!reportLabel) return true;
      return name.includes(reportLabel);
    });
  if (files.length === 0) {
    throw new Error(`NO_REPORT_FILES:${reportDir}`);
  }
  let latest: null | string = null;
  let latestMtime = 0;
  for (const file of files) {
    const fullPath = path.join(reportDir, file);
    const stat = await fs.stat(fullPath);
    const mtime = stat.mtimeMs;
    if (mtime > latestMtime) {
      latestMtime = mtime;
      latest = fullPath;
    }
  }
  if (!latest) {
    throw new Error(`NO_REPORT_FILES:${reportDir}`);
  }
  return latest;
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
    const validWaves = new Set(listMasterDataGovernanceWaves());
    if (!validWaves.has(wave)) {
      throw new TypeError(`INVALID_WAVE:${waveArg}`);
    }
    return listMasterDataGovernanceFieldsByWave(wave).map((field) => field.key);
  }
  return getMasterDataGovernanceFieldKeys();
}

function parseBool(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === '') return fallback;
  const normalized = value.toLowerCase().trim();
  if (['1', 'on', 'true', 'y', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'n', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function resolveValidationOptions(
  args: Map<string, string>,
): ValidationOptions {
  return {
    requireAuditExecuted: parseBool(args.get('requireAuditExecuted'), true),
    requireBackfillExecutedForCanonical: parseBool(
      args.get('requireBackfillExecutedForCanonical'),
      false,
    ),
    requireSeedExecutedForCanonical: parseBool(
      args.get('requireSeedExecutedForCanonical'),
      false,
    ),
  };
}

function assertEvidenceStatus(
  fieldKey: string,
  block: {
    reason?: string;
    status: 'executed' | 'skipped';
  },
  evidenceType: 'audit' | 'backfill' | 'seed',
) {
  if (block.status !== 'executed' && block.status !== 'skipped') {
    throw new Error(
      `INVALID_EVIDENCE_STATUS:${fieldKey}:${evidenceType}:${String(block.status)}`,
    );
  }
  if (block.status === 'skipped' && !String(block.reason || '').trim()) {
    throw new Error(`MISSING_SKIP_REASON:${fieldKey}:${evidenceType}`);
  }
}

function validateReport(
  report: GovernanceReport,
  requiredFieldKeys: string[],
  reportPath: string,
  options: ValidationOptions,
) {
  const byField = new Map(report.fields.map((item) => [item.fieldKey, item]));
  const missingFields = requiredFieldKeys.filter((key) => !byField.has(key));
  if (missingFields.length > 0) {
    throw new Error(`MISSING_FIELD_EVIDENCE:${missingFields.join(',')}`);
  }
  for (const fieldKey of requiredFieldKeys) {
    const entry = byField.get(fieldKey);
    if (!entry) continue;
    assertEvidenceStatus(fieldKey, entry.seed, 'seed');
    assertEvidenceStatus(fieldKey, entry.backfill, 'backfill');
    assertEvidenceStatus(fieldKey, entry.audit, 'audit');
    const field = getMasterDataGovernanceField(fieldKey);
    if (!field) {
      throw new TypeError(`INVALID_FIELD:${fieldKey}`);
    }
    const hasCanonical = Boolean(field.canonical);

    if (options.requireAuditExecuted && entry.audit.status !== 'executed') {
      throw new Error(`AUDIT_NOT_EXECUTED:${fieldKey}`);
    }
    if (
      hasCanonical &&
      options.requireSeedExecutedForCanonical &&
      report.options.runSeed &&
      entry.seed.status !== 'executed'
    ) {
      throw new Error(`SEED_NOT_EXECUTED:${fieldKey}`);
    }
    if (
      hasCanonical &&
      options.requireBackfillExecutedForCanonical &&
      report.options.runBackfill &&
      entry.backfill.status !== 'executed'
    ) {
      throw new Error(`BACKFILL_NOT_EXECUTED:${fieldKey}`);
    }
  }
  return {
    options,
    reportPath,
    reportGeneratedAt: report.generatedAt,
    reportId: report.reportId,
    requiredFieldKeys,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = resolveRepoRoot();
  const reportArg = String(args.get('report') || '').trim();
  const reportDirArg = String(args.get('reportDir') || '').trim();
  const reportLabel = String(args.get('reportLabel') || '')
    .trim()
    .replaceAll(/[^\w-]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .toLowerCase();
  const requiredFieldKeys = resolveFieldKeys(args);
  const options = resolveValidationOptions(args);

  const defaultReportDir = path.resolve(
    repoRoot,
    'tmp',
    'master-data-governance',
    'reports',
  );
  const reportPath = reportArg
    ? path.resolve(reportArg)
    : await pickLatestReport(
        reportDirArg ? path.resolve(reportDirArg) : defaultReportDir,
        reportLabel,
      );
  const reportText = await fs.readFile(reportPath, 'utf8');
  const report = JSON.parse(reportText) as GovernanceReport;
  const result = validateReport(report, requiredFieldKeys, reportPath, options);

  console.warn('[check-master-data-governance-report] result');
  console.warn(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('[check-master-data-governance-report] failed', error);
  process.exitCode = 1;
});
