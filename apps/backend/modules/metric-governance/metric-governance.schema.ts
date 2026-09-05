import type {
  MetricStructuredObject,
  MetricStructuredValue,
} from './metric-governance.types';

import { z } from 'zod';

import {
  METRIC_CATEGORIES,
  METRIC_CONFLICT_STATUSES,
  METRIC_FORMULA_TYPES,
  METRIC_OWNER_STATUSES,
  METRIC_SCOPE_POLICIES,
} from './metric-governance.types';

function isStructuredValue(value: unknown): value is MetricStructuredValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return true;
  }
  if (Array.isArray(value))
    return value.every((item) => isStructuredValue(item));
  if (typeof value !== 'object') return false;
  return Object.values(value).every((item) => isStructuredValue(item));
}

const structuredObjectSchema = z.custom<MetricStructuredObject>(
  (value) =>
    Boolean(value) &&
    !Array.isArray(value) &&
    typeof value === 'object' &&
    isStructuredValue(value),
  'Structured metadata must be a JSON object',
);

const versionSchema = z
  .object({
    businessDefinition: z.string().trim().min(1).max(4000),
    changeReason: z.string().trim().max(4000).optional(),
    conflictStatus: z.enum(METRIC_CONFLICT_STATUSES),
    denominatorDefinition: z.string().trim().max(4000).nullable().optional(),
    dimensions: structuredObjectSchema,
    effectiveFromAt: z.coerce.date().nullable().optional(),
    effectiveToAt: z.coerce.date().nullable().optional(),
    exclusions: structuredObjectSchema,
    formulaType: z.enum(METRIC_FORMULA_TYPES),
    numeratorDefinition: z.string().trim().max(4000).nullable().optional(),
    precision: z.number().int().min(0).max(8),
    refreshPolicy: z.string().trim().min(1).max(120),
    scopePolicy: z.enum(METRIC_SCOPE_POLICIES),
    sourceFields: structuredObjectSchema,
    sourceModel: structuredObjectSchema,
    approvalEvidence: z.string().trim().max(8000).nullable().optional(),
    decisionHistoryId: z.string().trim().max(120).nullable().optional(),
    sourceDocument: z.string().trim().max(500).nullable().optional(),
    unit: z.string().trim().min(1).max(64),
  })
  .strict();

export const createMetricDefinitionSchema = z
  .object({
    category: z.enum(METRIC_CATEGORIES),
    domain: z.string().trim().min(1).max(120),
    metricCode: z.string().trim().min(4).max(120),
    metricName: z.string().trim().min(1).max(200),
    ownerDeptId: z.string().trim().min(1).max(191).nullable().optional(),
    ownerStatus: z.enum(METRIC_OWNER_STATUSES).optional(),
    version: versionSchema,
  })
  .strict();

export const updateMetricDefinitionSchema = z
  .object({
    category: z.enum(METRIC_CATEGORIES).optional(),
    domain: z.string().trim().min(1).max(120).optional(),
    expectedRevision: z.number().int().min(1),
    metricName: z.string().trim().min(1).max(200).optional(),
    ownerDeptId: z.string().trim().min(1).max(191).nullable().optional(),
    ownerStatus: z.enum(METRIC_OWNER_STATUSES).optional(),
  })
  .strict();

export const activateMetricDefinitionSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
  })
  .strict();

export const createMetricVersionSchema = versionSchema
  .extend({
    expectedRevision: z.number().int().min(1),
  })
  .strict();

export const deprecateMetricDefinitionSchema = z
  .object({
    changeReason: z.string().trim().min(1).max(4000),
    expectedRevision: z.number().int().min(1),
  })
  .strict();
