import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { MasterDataGovernanceKernel } from '../core/master-data/governance-kernel';
import { listMasterDataGovernanceFields } from '../core/master-data/governance-registry';
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

async function writeConsistencyReport(payload: {
  reportDir?: string;
  reportLabel: string;
  summary: {
    fields: unknown[];
    summary: {
      allAligned: boolean;
      scannedFields: string[];
      totalInvalidCanonicalId: number;
      totalMissingCanonicalId: number;
      totalOrphanValues: number;
    };
  };
}) {
  const repoRoot = resolveRepoRoot();
  const timestamp = new Date();
  const reportLabel = slugify(payload.reportLabel || 'manual') || 'manual';
  const reportDir =
    payload.reportDir && payload.reportDir.trim()
      ? path.resolve(payload.reportDir)
      : path.resolve(repoRoot, 'tmp', 'master-data-governance', 'consistency');
  await fs.mkdir(reportDir, { recursive: true });
  const report = {
    ...payload.summary,
    generatedAt: timestamp.toISOString(),
    reportId: `${timestamp.toISOString()}-${reportLabel}`,
    reportLabel,
  };
  const fileName = `consistency-report-${timestamp
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')}-${reportLabel}.json`;
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
  const fieldsArg = String(args.get('fields') || '').trim();
  const selectedKeys = fieldsArg
    ? fieldsArg
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : null;
  const fields = listMasterDataGovernanceFields().filter(
    (item) => !selectedKeys || selectedKeys.includes(item.key),
  );
  const writeReport = parseBool(args.get('writeReport'), true);
  const reportLabel = String(args.get('reportLabel') || 'manual').trim();
  const reportDir = String(args.get('reportDir') || '').trim();

  const fieldReports = [];
  let totalMissingCanonicalId = 0;
  let totalInvalidCanonicalId = 0;
  let totalOrphanValues = 0;
  const allOrphans = await MasterDataGovernanceKernel.auditOrphans();

  for (const field of fields) {
    const fieldOrphans = allOrphans.filter(
      (item) => item.configKey === field.key,
    );
    const orphanValues = fieldOrphans.length;
    const orphanRows = fieldOrphans.reduce((sum, item) => sum + item.count, 0);
    totalOrphanValues += orphanValues;

    let missingRows: Awaited<
      ReturnType<typeof MasterDataGovernanceKernel.auditMissingCanonicalIds>
    > = [];
    let invalidRows: Awaited<
      ReturnType<typeof MasterDataGovernanceKernel.auditInvalidCanonicalIds>
    > = [];
    let missingCanonicalId = 0;
    let invalidCanonicalId = 0;
    if (field.canonical) {
      missingRows = await MasterDataGovernanceKernel.auditMissingCanonicalIds(
        field.key,
      );
      invalidRows = await MasterDataGovernanceKernel.auditInvalidCanonicalIds(
        field.key,
      );
      missingCanonicalId = missingRows.reduce(
        (sum, item) => sum + item.missingCanonicalId,
        0,
      );
      invalidCanonicalId = invalidRows.reduce(
        (sum, item) => sum + item.invalidCanonicalId,
        0,
      );
      totalMissingCanonicalId += missingCanonicalId;
      totalInvalidCanonicalId += invalidCanonicalId;
    }

    fieldReports.push({
      fieldKey: field.key,
      hasCanonical: Boolean(field.canonical),
      orphanRows,
      orphanValues,
      orphanByValue: fieldOrphans,
      missingCanonicalId,
      invalidCanonicalId,
      missingByTable: missingRows,
      invalidByTable: invalidRows,
    });
  }

  const summary = {
    summary: {
      allAligned:
        totalMissingCanonicalId === 0 &&
        totalInvalidCanonicalId === 0 &&
        totalOrphanValues === 0,
      scannedFields: fields.map((field) => field.key),
      totalInvalidCanonicalId,
      totalMissingCanonicalId,
      totalOrphanValues,
    },
    fields: fieldReports,
  };

  console.warn('[check-master-data-consistency] result');
  console.warn(JSON.stringify(summary, null, 2));

  if (writeReport) {
    const reportPath = await writeConsistencyReport({
      summary,
      reportLabel,
      reportDir,
    });
    console.warn('[check-master-data-consistency] report');
    console.warn(JSON.stringify({ reportPath }, null, 2));
  }

  if (!summary.summary.allAligned) {
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error('[check-master-data-consistency] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
