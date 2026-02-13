export function parseWorkOrderNumber(value: unknown): string {
  return String(value ?? '').trim();
}

export function parseRequiredWorkOrderNumber(value: unknown): null | string {
  const normalized = parseWorkOrderNumber(value);
  return normalized || null;
}

export function parseWorkOrderQuantity(
  value: unknown,
  defaultValue = 1,
): number {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.max(0, Math.trunc(parsed));
}

export function parseRequiredDate(value: unknown, fallback = new Date()): Date {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function parseOptionalDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
