import type { quality_plans_planStatus } from '@prisma/client';

import { nanoid } from 'nanoid';

const ITP_PLAN_STATUS_VALUES = new Set<quality_plans_planStatus>([
  'ACTIVE',
  'APPROVED',
  'ARCHIVED',
  'DRAFT',
  'IN_REVIEW',
]);
const DEFAULT_ITP_CUSTOMER = 'Default Customer';
const DEFAULT_ITP_ITEM_CONTROL_POINT = 'W';
const DEFAULT_ITP_ITEM_FREQUENCY = '100%';
const DEFAULT_ITP_ITEM_PROCESS_STEP = '组对';
const DEFAULT_ITP_PREPARED_BY = 'admin';
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

export function buildItpProjectCreateData(
  body: Record<string, unknown>,
  options?: { preparedBy?: string },
) {
  return {
    customer: normalizeItpText(body.customerName) || DEFAULT_ITP_CUSTOMER,
    id: createItpProjectId(),
    itpItems: '[]',
    planStatus: normalizeItpPlanStatus(body.status),
    preparedBy: options?.preparedBy || DEFAULT_ITP_PREPARED_BY,
    projectName: normalizeItpText(body.projectName) || '',
    updatedAt: new Date(),
    version: 1,
    workOrderNumber: normalizeItpText(body.workOrderId) || '',
  };
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

export function getMaxItpItemOrder(items: Array<{ order?: null | number }>) {
  if (items.length === 0) {
    return 0;
  }

  return Math.max(...items.map((item) => item.order || 0));
}

interface ItpItemInput {
  acceptanceCriteria?: unknown;
  activity?: unknown;
  controlPoint?: unknown;
  frequency?: unknown;
  isQuantitative?: unknown;
  processStep?: unknown;
  quantitativeItems?: unknown;
  referenceDoc?: unknown;
  verifyingDocument?: unknown;
}

export function buildItpItemCreateData(params: {
  item: ItpItemInput;
  order: number;
  projectId: string;
  useImportDefaults?: boolean;
}) {
  const { item, order, projectId, useImportDefaults = false } = params;
  return {
    acceptanceCriteria:
      normalizeItpText(item.acceptanceCriteria) ??
      (useImportDefaults ? '' : undefined),
    activity:
      normalizeItpText(item.activity) ?? (useImportDefaults ? '' : undefined),
    controlPoint:
      normalizeItpText(item.controlPoint) ??
      (useImportDefaults ? DEFAULT_ITP_ITEM_CONTROL_POINT : undefined),
    frequency:
      normalizeItpText(item.frequency) ??
      (useImportDefaults ? DEFAULT_ITP_ITEM_FREQUENCY : undefined),
    isQuantitative: Boolean(item.isQuantitative),
    order,
    processStep:
      normalizeItpText(item.processStep) ??
      (useImportDefaults ? DEFAULT_ITP_ITEM_PROCESS_STEP : undefined),
    projectId,
    quantitativeItems: stringifyItpQuantitativeItems(item.quantitativeItems),
    referenceDoc:
      normalizeItpText(item.referenceDoc) ??
      (useImportDefaults ? '' : undefined),
    verifyingDocument:
      normalizeItpText(item.verifyingDocument) ??
      (useImportDefaults ? '' : undefined),
  };
}
