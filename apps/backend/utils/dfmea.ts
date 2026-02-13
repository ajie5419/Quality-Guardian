import { nanoid } from 'nanoid';

export function parseDfmeaScore(value: unknown, defaultValue = 5): number {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.max(1, Math.min(10, Math.trunc(parsed)));
}

export function calculateDfmeaRpn(
  severity: number,
  occurrence: number,
  detection: number,
): number {
  return severity * occurrence * detection;
}

export function normalizeDfmeaEffect(body: Record<string, unknown>): string {
  return String(body.effects ?? body.effect ?? '').trim();
}

export function parseDfmeaOrder(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    return 0;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.trunc(parsed));
}

export function createDfmeaProjectId(): string {
  return `DFMEA-${nanoid(6).toUpperCase()}`;
}
