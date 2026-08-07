import process from 'node:process';

import { reconcilePassRateIdentity } from './reconcile-pass-rate-identity';

function iso(date: Date) {
  return date.toISOString();
}

function monthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function previousMonthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
}

export function parsePassRateWindowOptions(args: string[]) {
  if (args.length !== 1 || args[0] !== '--apply') {
    throw new Error('APPLY_REQUIRED');
  }
}

/** Every window persists an independent run against its generation snapshot. */
export async function reconcilePassRateIdentityWindows(
  args = process.argv.slice(2),
  now = new Date(),
) {
  parsePassRateWindowOptions(args);
  const currentMonth = monthStart(now);
  const previousMonth = previousMonthStart(now);
  const recentWeek = new Date(now);
  recentWeek.setUTCDate(recentWeek.getUTCDate() - 7);
  const crossMonthStart = new Date(currentMonth);
  crossMonthStart.setUTCDate(crossMonthStart.getUTCDate() - 3);
  const crossMonthEnd = new Date(currentMonth);
  crossMonthEnd.setUTCDate(crossMonthEnd.getUTCDate() + 3);
  const windows = [
    { end: now, label: 'CURRENT_MONTH', start: currentMonth },
    { end: currentMonth, label: 'PREVIOUS_MONTH', start: previousMonth },
    { end: now, label: 'RECENT_SEVEN_DAYS', start: recentWeek },
    { end: crossMonthEnd, label: 'CROSS_MONTH', start: crossMonthStart },
    {
      end: new Date('2100-01-31T23:59:59.999Z'),
      label: 'NO_DATA_FUTURE',
      start: new Date('2100-01-01T00:00:00.000Z'),
    },
    {
      end: new Date('2026-02-28T23:59:59.999Z'),
      label: 'HISTORICAL_BACKFILL',
      start: new Date('2026-02-01T00:00:00.000Z'),
    },
  ];
  return Promise.all(
    windows.map((window) =>
      reconcilePassRateIdentity([
        '--apply',
        `--start=${iso(window.start)}`,
        `--end=${iso(window.end)}`,
        `--label=${window.label}`,
      ]),
    ),
  );
}

if (process.argv[1]?.endsWith('reconcile-pass-rate-identity-windows.ts')) {
  void reconcilePassRateIdentityWindows().then((summary) => {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  });
}
