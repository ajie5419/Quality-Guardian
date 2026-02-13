import type { quality_plans_planStatus } from '@prisma/client';

import { nanoid } from 'nanoid';

const ITP_PLAN_STATUS_VALUES = new Set<quality_plans_planStatus>([
  'ACTIVE',
  'APPROVED',
  'ARCHIVED',
  'DRAFT',
  'IN_REVIEW',
]);
const DEFAULT_ITP_PROJECT_VERSION = 'V1.0';

export function normalizeItpText(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

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

export function toItpProjectVersionText(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_ITP_PROJECT_VERSION;
  }
  return String(value);
}

export function buildItpProjectUpdateData(body: Record<string, unknown>) {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (body.status !== undefined) {
    updateData.planStatus = normalizeItpPlanStatus(body.status);
  }
  if (body.projectName !== undefined) {
    updateData.projectName = normalizeItpText(body.projectName) ?? '';
  }
  if (body.workOrderId !== undefined) {
    updateData.workOrderNumber = normalizeItpText(body.workOrderId) ?? '';
  }
  if (body.customerName !== undefined) {
    updateData.customer = normalizeItpText(body.customerName) ?? '';
  }

  return updateData;
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
