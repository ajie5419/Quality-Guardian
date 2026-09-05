import type { InspectionRequestStatsAccumulator } from './inspection-request-stats-accumulator';

import {
  inspectionRequestDurationMinutes as durationMinutes,
  formatInspectionRequestStatsDate as formatShanghaiDate,
} from './inspection-request-stats-date';
import {
  incrementReinspectionCounts,
  isIncomingInspectionRequest,
  normalizeIdentityId,
  UNRESOLVED_IDENTITY_KEY,
} from './inspection-request-stats-identity';

/**
 * Minimal period-request shape consumed by the pure aggregation core. It is
 * the legacy per-row contract (PERF-QMS-001 / PHASE-2A oracle): DB
 * pre-aggregated groups carry the same fields plus a requestCount multiplier
 * and the SQL-computed duration sum.
 */
export interface PeriodRequestRow {
  category: 'INCOMING' | 'PROCESS' | 'SHIPMENT' | null;
  closedAt: Date | null;
  dispatchedAt: Date | null;
  inspectionResult: string;
  inspectorId: null | string;
  linkedIssueId: null | string;
  linkedIssueNo: null | string;
  processId: null | string;
  responsibilityType: null | string;
  responsibleDepartmentId: null | string;
  status: string;
  submittedAt: Date;
  supplierId: null | string;
  teamId: null | string;
}

export interface PeriodSubmittedGroup {
  category: PeriodSubmittedInput['category'];
  hasLinkedIssue: PeriodSubmittedInput['hasLinkedIssue'];
  inspectionResult: string;
  processId: null | string;
  requestCount: number;
  responsibilityType: null | string;
  responsibleDepartmentId: null | string;
  status: string;
  submittedDate: string;
  supplierId: null | string;
  teamId: null | string;
}

export interface PeriodClosedGroup {
  category: PeriodRequestRow['category'];
  closedDate: string;
  inspectorId: null | string;
  inspectorRealName: null | string;
  inspectorUsername: null | string;
  requestCount: number;
  supplierId: null | string;
  teamId: null | string;
  totalTaskMinutes: number;
}

export interface PeriodRequestStatsContext {
  processDepartmentsById: ReadonlyMap<string, string>;
  teamCanonicalById: ReadonlyMap<string, string>;
}

/**
 * Fields the submitted classifier reads. Legacy rows carry linkedIssueId/
 * linkedIssueNo; DB pre-aggregated groups carry the SQL-computed
 * hasLinkedIssue flag instead.
 */
export interface PeriodSubmittedInput {
  category: PeriodRequestRow['category'];
  hasLinkedIssue?: boolean;
  inspectionResult: string;
  linkedIssueId?: null | string;
  linkedIssueNo?: null | string;
  processId: null | string;
  responsibilityType: null | string;
  responsibleDepartmentId: null | string;
  status: string;
  supplierId: null | string;
  teamId: null | string;
}

export interface PeriodSubmittedClassification {
  departmentIdentityKey: string;
  hasClosed: boolean;
  hasReinspection: boolean;
  isIncoming: boolean;
  isInternalProcess: boolean;
  submittedDate: string;
  supplierIdentityKey: string;
  teamIdentityKey: string;
  usesSupplierIdentity: boolean;
}

export interface PeriodClosedClassification {
  closedDate: string;
  closedIsIncoming: boolean;
  inspectorKey: string;
}

/**
 * Classifies one submitted-in-range request (or the group row that represents
 * it) into the identity buckets and reinspection flags the legacy per-row
 * loop derived. Pure: only reads row fields + resolved identity maps.
 */
export function classifyPeriodSubmittedRow(
  item: PeriodSubmittedInput,
  ctx: PeriodRequestStatsContext,
  submittedDate: string,
): PeriodSubmittedClassification {
  const isIncoming = isIncomingInspectionRequest(item);
  const isExternalResponsibility =
    item.responsibilityType === 'SUPPLIER' ||
    item.responsibilityType === 'OUTSOURCING_UNIT';
  const usesSupplierIdentity = isExternalResponsibility || isIncoming;
  const isInternalProcess = !isIncoming && !isExternalResponsibility;
  const supplierIdentityKey =
    normalizeIdentityId(item.supplierId) || UNRESOLVED_IDENTITY_KEY;
  const departmentIdentityKey =
    normalizeIdentityId(item.responsibleDepartmentId) ||
    normalizeIdentityId(ctx.processDepartmentsById.get(item.processId)) ||
    UNRESOLVED_IDENTITY_KEY;
  const teamIdentityKey =
    normalizeIdentityId(
      ctx.teamCanonicalById.get(item.teamId) ?? item.teamId,
    ) ||
    (isInternalProcess && departmentIdentityKey !== UNRESOLVED_IDENTITY_KEY
      ? `dept:${departmentIdentityKey}`
      : '');
  const hasLinkedIssue =
    item.hasLinkedIssue ?? Boolean(item.linkedIssueId || item.linkedIssueNo);
  const hasClosed = item.status === 'CLOSED';
  const hasReinspection =
    hasClosed && (hasLinkedIssue || item.inspectionResult === 'FAIL');
  return {
    departmentIdentityKey,
    hasClosed,
    hasReinspection,
    isIncoming,
    isInternalProcess,
    submittedDate,
    supplierIdentityKey,
    teamIdentityKey,
    usesSupplierIdentity,
  };
}

export function classifyPeriodClosedRow(
  item: Pick<
    PeriodRequestRow,
    'category' | 'inspectorId' | 'supplierId' | 'teamId'
  >,
  closedDate: string,
): PeriodClosedClassification {
  return {
    closedDate,
    closedIsIncoming: isIncomingInspectionRequest(item),
    inspectorKey:
      normalizeIdentityId(item.inspectorId) || UNRESOLVED_IDENTITY_KEY,
  };
}

/**
 * Applies one submitted group (or one legacy row with count = 1) to the
 * accumulator. Every mutation is additive, so the count multiplier keeps the
 * Node input at O(groups) while producing the same totals as the legacy
 * per-row loop.
 */
export function applyPeriodSubmittedGroup(
  acc: InspectionRequestStatsAccumulator,
  cls: PeriodSubmittedClassification,
  count: number,
) {
  if (count <= 0) return;
  acc.counters.todaySubmittedCount += count;
  const daily = acc.dailyTrendMap.get(cls.submittedDate);
  if (daily) daily.submittedCount += count;
  if (cls.isIncoming) {
    acc.counters.todaySubmittedIncomingCount += count;
  } else {
    acc.counters.todaySubmittedProcessCount += count;
  }
  if (cls.usesSupplierIdentity) {
    acc.supplierMap.set(
      cls.supplierIdentityKey,
      (acc.supplierMap.get(cls.supplierIdentityKey) || 0) + count,
    );
  }
  if (cls.isInternalProcess) {
    acc.departmentMap.set(
      cls.departmentIdentityKey,
      (acc.departmentMap.get(cls.departmentIdentityKey) || 0) + count,
    );
    acc.historyDepartmentMap.set(
      cls.departmentIdentityKey,
      (acc.historyDepartmentMap.get(cls.departmentIdentityKey) || 0) + count,
    );
    if (cls.teamIdentityKey) {
      acc.teamMap.set(
        cls.teamIdentityKey,
        (acc.teamMap.get(cls.teamIdentityKey) || 0) + count,
      );
      acc.historyTeamMap.set(
        cls.teamIdentityKey,
        (acc.historyTeamMap.get(cls.teamIdentityKey) || 0) + count,
      );
    }
  }
  const reinspectionMap = cls.usesSupplierIdentity
    ? acc.supplierReinspectionMap
    : acc.departmentReinspectionMap;
  const reinspectionKey = cls.usesSupplierIdentity
    ? cls.supplierIdentityKey
    : cls.departmentIdentityKey;
  incrementReinspectionCounts(
    reinspectionMap,
    reinspectionKey,
    cls.hasClosed,
    cls.hasReinspection,
    count,
  );
  if (cls.isInternalProcess && cls.teamIdentityKey) {
    incrementReinspectionCounts(
      acc.teamReinspectionMap,
      cls.teamIdentityKey,
      cls.hasClosed,
      cls.hasReinspection,
      count,
    );
  }
}

/**
 * Applies one closed group (or one legacy row with count = 1) to the
 * accumulator. totalTaskMinutes is the SQL SUM of the per-row floored
 * minute durations for the group; the legacy row path passes the single
 * row's duration so both paths land on the same totals.
 */
export function applyPeriodClosedGroup(
  acc: InspectionRequestStatsAccumulator,
  cls: PeriodClosedClassification,
  count: number,
  totalTaskMinutes: number,
) {
  if (count <= 0) return;
  acc.counters.todayClosedCount += count;
  if (cls.closedIsIncoming) {
    acc.counters.todayClosedIncomingCount += count;
  } else {
    acc.counters.todayClosedProcessCount += count;
  }
  const daily = acc.dailyTrendMap.get(cls.closedDate);
  if (daily) daily.closedCount += count;
  acc.inspectorMap.set(
    cls.inspectorKey,
    (acc.inspectorMap.get(cls.inspectorKey) || 0) + count,
  );
  const existing = acc.historyInspectorMap.get(cls.inspectorKey) || {
    averageTaskMinutes: 0,
    completedTaskCount: 0,
    totalTaskMinutes: 0,
  };
  existing.completedTaskCount += count;
  existing.totalTaskMinutes += totalTaskMinutes;
  existing.averageTaskMinutes = Math.round(
    existing.totalTaskMinutes / existing.completedTaskCount,
  );
  acc.historyInspectorMap.set(cls.inspectorKey, existing);
}

/**
 * Legacy per-row accumulation (PERF-QMS-001 / PHASE-2A oracle). Production
 * never runs this path; tests use it to prove the DB pre-aggregated group
 * path produces identical results on the same fixture.
 */
export function accumulatePeriodRequestRows(
  acc: InspectionRequestStatsAccumulator,
  rows: PeriodRequestRow[],
  ctx: PeriodRequestStatsContext,
  start: Date,
  end: Date,
) {
  for (const item of rows) {
    if (
      item.submittedAt >= start &&
      item.submittedAt < end &&
      item.status !== 'CANCELLED'
    ) {
      applyPeriodSubmittedGroup(
        acc,
        classifyPeriodSubmittedRow(
          item,
          ctx,
          formatShanghaiDate(item.submittedAt),
        ),
        1,
      );
    }
    if (
      item.closedAt &&
      item.closedAt >= start &&
      item.closedAt < end &&
      item.status === 'CLOSED'
    ) {
      const taskMinutes = durationMinutes(
        item.dispatchedAt || item.submittedAt,
        item.closedAt,
      );
      applyPeriodClosedGroup(
        acc,
        classifyPeriodClosedRow(item, formatShanghaiDate(item.closedAt)),
        1,
        taskMinutes,
      );
    }
  }
}
