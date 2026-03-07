export function formatReportDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

  const raw = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const parsed = new Date(raw);
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
