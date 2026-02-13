import { nanoid } from 'nanoid';

const DEFAULT_DFMEA_PROJECT_STATUS = 'active';
const DEFAULT_DFMEA_PROJECT_VERSION = 'V1.0';

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

export function normalizeDfmeaText(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

export function normalizeDfmeaProjectStatus(value: unknown): string {
  return normalizeDfmeaText(value) || DEFAULT_DFMEA_PROJECT_STATUS;
}

export function toDfmeaProjectVersionText(value: unknown): string {
  return normalizeDfmeaText(value) || DEFAULT_DFMEA_PROJECT_VERSION;
}

export function buildDfmeaProjectUpdateData(body: Record<string, unknown>) {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (body.projectName !== undefined) {
    updateData.projectName = normalizeDfmeaText(body.projectName) ?? '';
  }
  if (body.workOrderId !== undefined) {
    updateData.workOrderId = normalizeDfmeaText(body.workOrderId) || null;
  }
  if (body.version !== undefined) {
    updateData.version = toDfmeaProjectVersionText(body.version);
  }
  if (body.status !== undefined) {
    updateData.status = normalizeDfmeaProjectStatus(body.status);
  }
  if (body.description !== undefined) {
    updateData.description = normalizeDfmeaText(body.description) || '';
  }

  return updateData;
}
