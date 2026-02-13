export function formatReportDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export type ReportPeriodType = 'monthly' | 'weekly';

export function parseReportPeriodType(value: unknown): null | ReportPeriodType {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) {
    return 'weekly';
  }

  if (normalized === 'weekly' || normalized === 'monthly') {
    return normalized;
  }

  return null;
}

export function parseReportDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function getReportDayRange(date: Date): { end: Date; start: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return { end, start };
}

export function resolveReportDateRangeQuery(
  startValue: unknown,
  endValue: unknown,
):
  | {
      endDate: string;
      reason: null;
      startDate: string;
    }
  | {
      endDate?: undefined;
      reason: 'INVALID' | 'MISSING';
      startDate?: undefined;
    } {
  const startDate = String(startValue ?? '').trim();
  const endDate = String(endValue ?? '').trim();

  if (!startDate || !endDate) {
    return { reason: 'MISSING' };
  }

  if (!parseReportDate(startDate) || !parseReportDate(endDate)) {
    return { reason: 'INVALID' };
  }

  return { endDate, reason: null, startDate };
}

export function parseReportNumber(value: unknown, defaultValue = 0): number {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return defaultValue;
  }

  return parsed;
}

export function normalizeReportStatus(value: unknown): string {
  const normalized = String(value ?? '').trim();
  return normalized || 'Draft';
}

export function normalizeReportAuthor(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

export function resolveReportQueryDate(value: unknown): {
  date: Date;
  valid: boolean;
} {
  if (value === undefined || value === null || value === '') {
    return { date: new Date(), valid: true };
  }

  const parsed = parseReportDate(value);
  if (!parsed) {
    return { date: new Date(), valid: false };
  }

  return { date: parsed, valid: true };
}
