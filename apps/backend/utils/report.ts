export function formatReportDate(date: Date): string {
  return date.toISOString().split('T')[0];
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
