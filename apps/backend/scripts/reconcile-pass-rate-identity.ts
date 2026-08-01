import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

import { PassRateShadowReconciliationService } from '~/modules/report/pass-rate-shadow-reconciliation.service';

type Baseline = { contentChecksum?: unknown };

function parseDate(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new Error('INVALID_DATE');
  return parsed;
}

export function parsePassRateReconciliationOptions(args: string[]) {
  if (!args.includes('--apply')) throw new Error('APPLY_REQUIRED');
  const start = parseDate(
    args.find((arg) => arg.startsWith('--start='))?.slice('--start='.length),
    new Date('2000-01-01T00:00:00.000Z'),
  );
  const end = parseDate(
    args.find((arg) => arg.startsWith('--end='))?.slice('--end='.length),
    new Date(),
  );
  if (start > end) throw new Error('INVALID_DATE_RANGE');
  const label = String(
    args.find((arg) => arg.startsWith('--label='))?.slice('--label='.length) ||
      'custom',
  ).trim();
  if (!label || label.length > 80) throw new Error('INVALID_WINDOW_LABEL');
  if (
    args.some(
      (arg) =>
        arg !== '--apply' &&
        !arg.startsWith('--start=') &&
        !arg.startsWith('--end=') &&
        !arg.startsWith('--label='),
    )
  ) {
    throw new Error('UNKNOWN_ARGUMENT');
  }
  return { end, label, start };
}

async function readBaselineChecksum() {
  const file = resolve(
    process.cwd(),
    '../../docs/baselines/master-data-identity-2026-08-01.json',
  );
  const parsed = JSON.parse(await readFile(file, 'utf8')) as Baseline;
  const checksum = String(parsed.contentChecksum || '').trim();
  if (!checksum) throw new Error('BASELINE_CHECKSUM_REQUIRED');
  return checksum;
}

export async function reconcilePassRateIdentity(args = process.argv.slice(2)) {
  const options = parsePassRateReconciliationOptions(args);
  return PassRateShadowReconciliationService.run({
    baselineChecksum: await readBaselineChecksum(),
    end: options.end,
    start: options.start,
    windowLabel: options.label,
  });
}

if (process.argv[1]?.endsWith('reconcile-pass-rate-identity.ts')) {
  void reconcilePassRateIdentity().then((summary) => {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  });
}
