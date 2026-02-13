import type { quality_plans_planStatus } from '@prisma/client';

import { nanoid } from 'nanoid';

const ITP_PLAN_STATUS_VALUES = new Set<quality_plans_planStatus>([
  'ACTIVE',
  'APPROVED',
  'ARCHIVED',
  'DRAFT',
  'IN_REVIEW',
]);

export function createItpProjectId(): string {
  return `ITP-PROJ-${nanoid(6).toUpperCase()}`;
}

export function normalizeItpPlanStatus(
  value: unknown,
): quality_plans_planStatus {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase();
  if (ITP_PLAN_STATUS_VALUES.has(normalized as quality_plans_planStatus)) {
    return normalized as quality_plans_planStatus;
  }
  return 'DRAFT';
}

export function toItpPlanStatusText(
  value: null | quality_plans_planStatus | string,
): string {
  if (!value) {
    return 'draft';
  }
  return String(value).toLowerCase();
}

export function parseItpQuantitativeItems(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function stringifyItpQuantitativeItems(value: unknown): string {
  return JSON.stringify(parseItpQuantitativeItems(value));
}
