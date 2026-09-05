export const METRIC_CATEGORIES = ['A', 'B', 'C', 'D'] as const;
export const METRIC_OWNER_STATUSES = [
  'UNCONFIRMED',
  'CONFIRMED',
  'CONFIRMED_FROM_APPROVAL',
] as const;
export const METRIC_OWNER_ROLES = ['BUSINESS', 'POLICY', 'DATA'] as const;
export const METRIC_DECISION_STATUSES = [
  'APPROVED',
  'APPROVED_WITH_POLICY_PENDING',
] as const;
export const METRIC_STATUSES = ['DRAFT', 'ACTIVE', 'DEPRECATED'] as const;
export const METRIC_SCOPE_POLICIES = [
  'ALL',
  'DEPT',
  'SELF',
  'SOURCE_INHERITED',
  'NOT_APPLICABLE',
] as const;
export const METRIC_CONFLICT_STATUSES = [
  'NO_CONFLICT',
  'CANONICAL_CANDIDATE',
  'BUSINESS_DECISION_REQUIRED',
] as const;
export const METRIC_FORMULA_TYPES = [
  'AVERAGE',
  'COUNT',
  'INDEX',
  'PERCENTAGE',
  'RATIO',
  'RPN',
  'SUM',
  'WEIGHTED_SCORE',
] as const;

export type MetricCategory = (typeof METRIC_CATEGORIES)[number];
export type MetricConflictStatus = (typeof METRIC_CONFLICT_STATUSES)[number];
export type MetricFormulaType = (typeof METRIC_FORMULA_TYPES)[number];
export type MetricOwnerStatus = (typeof METRIC_OWNER_STATUSES)[number];
export type MetricOwnerRole = (typeof METRIC_OWNER_ROLES)[number];
export type MetricDecisionStatus = (typeof METRIC_DECISION_STATUSES)[number];
export type MetricScopePolicy = (typeof METRIC_SCOPE_POLICIES)[number];

export type MetricStructuredValue =
  | boolean
  | MetricStructuredObject
  | MetricStructuredValue[]
  | null
  | number
  | string;

export interface MetricStructuredObject {
  [key: string]: MetricStructuredValue;
}

export interface MetricVersionInput {
  businessDefinition: string;
  changeReason?: string;
  conflictStatus: MetricConflictStatus;
  denominatorDefinition?: null | string;
  dimensions: MetricStructuredObject;
  effectiveFromAt?: Date | null;
  effectiveToAt?: Date | null;
  exclusions: MetricStructuredObject;
  formulaType: MetricFormulaType;
  numeratorDefinition?: null | string;
  precision: number;
  refreshPolicy: string;
  scopePolicy: MetricScopePolicy;
  sourceFields: MetricStructuredObject;
  sourceModel: MetricStructuredObject;
  unit: string;
  approvalEvidence?: null | string;
  decisionHistoryId?: null | string;
  sourceDocument?: null | string;
}

export interface CreateMetricDefinitionInput {
  category: MetricCategory;
  domain: string;
  metricCode: string;
  metricName: string;
  ownerDeptId?: null | string;
  ownerStatus?: MetricOwnerStatus;
  version: MetricVersionInput;
}

export interface UpdateMetricDefinitionInput {
  category?: MetricCategory;
  domain?: string;
  expectedRevision: number;
  metricName?: string;
  ownerDeptId?: null | string;
  ownerStatus?: MetricOwnerStatus;
}

export interface NewMetricVersionInput extends MetricVersionInput {
  expectedRevision: number;
}

export interface MetricGovernanceActor {
  userId: string;
}
