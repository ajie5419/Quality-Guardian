import type { PrismaClient } from '@prisma/client';

import {
  parseAttachmentItems,
  resolveAttachmentLookup,
} from '~/modules/file-storage/file-attachment';

/**
 * Shared drift classification for the inspections documents JSON snapshot
 * columns vs the canonical `file_references` rows (CLOSE-EFFECTS-RECONCILE-
 * 001). Both the read-only audit (`audit-inspection-document-drift.ts`) and
 * the reconcile tool (`reconcile-inspection-document-drift.ts`) use these
 * functions so the four drift categories never diverge.
 *
 * Canonical source: `file_references(bizType=inspection_record, fieldName in
 * documents|selfCheckDocuments)`. The JSON columns are a compatibility
 * snapshot and may be rebuilt, deduped or pruned — legitimate references are
 * never deleted to make the JSON "fit".
 */

export type InspectionDocumentFieldName = 'documents' | 'selfCheckDocuments';

export type InspectionDocumentDriftType =
  | 'duplicate_json_id'
  | 'invalid_file_id'
  | 'json_without_reference'
  | 'reference_without_json';

export type InspectionDocumentRepairAction =
  | 'DEDUPE_SNAPSHOT'
  | 'MANUAL_REVIEW'
  | 'REBUILD_SNAPSHOT'
  | 'REMOVE_INVALID_SNAPSHOT'
  | 'REPAIR_REFERENCE';

export type InspectionDocumentAssetStatus =
  | 'ACTIVE'
  | 'DELETED'
  | 'MISSING'
  | 'UNKNOWN';

export type InspectionDocumentConfidence = 'HIGH' | 'LOW' | 'MEDIUM';

export interface InspectionDocumentFieldDrift {
  fieldName: InspectionDocumentFieldName;
  /** Raw parsed attachment items, JSON order (unknown[] from parse). */
  jsonItems: unknown[];
  /** Distinct fileIds in JSON order (items without a fileId are skipped). */
  jsonFileIds: string[];
  /** JSON fileIds with no canonical reference, JSON order. */
  jsonWithoutReference: string[];
  /** Canonical reference fileIds missing from the JSON, reference order. */
  referenceWithoutJson: string[];
  /** Distinct fileIds that occur more than once in one field, JSON order. */
  duplicateJsonIds: string[];
  /** Total extra occurrences beyond the first per duplicated fileId. */
  duplicateJsonOccurrences: number;
  /** Distinct JSON fileIds whose asset is not ACTIVE, JSON order. */
  invalidFileIds: string[];
}

export interface InspectionDocumentReconcilePlanEntry {
  inspectionId: string;
  fieldName: InspectionDocumentFieldName;
  driftTypes: InspectionDocumentDriftType[];
  proposedAction: InspectionDocumentRepairAction;
  requiresManualReview: boolean;
  confidence: InspectionDocumentConfidence;
  reason: string;
  /** Snapshot fileIds at plan time (JSON order, duplicates preserved). */
  before: string[];
  /** Target snapshot fileIds computed at plan time (informational; apply
   *  recomputes from the live snapshot). */
  after: string[];
  /** Snapshot fileIds to drop (dead assets without a canonical reference). */
  removeFileIds: string[];
  /** Canonical reference fileIds to append back into the snapshot. */
  appendFileIds: string[];
  /** Canonical references to create for json_without_reference entries. */
  repairReferences: Array<{ fileId: string }>;
  /** Full snapshot columns at plan time, for review and rollback. */
  rollback: {
    documents: null | string;
    selfCheckDocuments: null | string;
  };
}

export interface InspectionDocumentReconcilePlan {
  version: 1;
  generatedAt: string;
  entries: InspectionDocumentReconcilePlanEntry[];
}

function attachmentFileId(item: unknown): string {
  const lookup = resolveAttachmentLookup(item);
  return 'fileId' in lookup ? lookup.fileId : '';
}

/** Distinct fileIds referenced by a snapshot column, JSON order. */
export function collectInspectionDocumentFileIds(
  snapshotValue: null | string,
): string[] {
  const ids: string[] = [];
  for (const item of parseAttachmentItems(snapshotValue)) {
    const fileId = attachmentFileId(item);
    if (fileId && !ids.includes(fileId)) ids.push(fileId);
  }
  return ids;
}

export function classifyInspectionDocumentField(params: {
  /** Status lookup for any fileId; absent entries are UNKNOWN (no asset). */
  assetStatusByFileId: ReadonlyMap<string, InspectionDocumentAssetStatus>;
  fieldName: InspectionDocumentFieldName;
  /** Ordered canonical reference fileIds for this biz + field. */
  referenceFileIds: string[];
  snapshotValue: null | string;
}): InspectionDocumentFieldDrift {
  const jsonItems = parseAttachmentItems(params.snapshotValue);
  const jsonFileIds: string[] = [];
  const occurrenceCount = new Map<string, number>();
  for (const item of jsonItems) {
    const fileId = attachmentFileId(item);
    if (!fileId) continue;
    occurrenceCount.set(fileId, (occurrenceCount.get(fileId) ?? 0) + 1);
    if (!jsonFileIds.includes(fileId)) jsonFileIds.push(fileId);
  }

  const refSet = new Set(params.referenceFileIds);
  const jsonWithoutReference = jsonFileIds.filter(
    (fileId) => !refSet.has(fileId),
  );
  const referenceWithoutJson = params.referenceFileIds.filter(
    (fileId) => !jsonFileIds.includes(fileId),
  );
  const duplicateJsonIds = jsonFileIds.filter(
    (fileId) => (occurrenceCount.get(fileId) ?? 0) > 1,
  );
  const duplicateJsonOccurrences = [...occurrenceCount.values()].reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0,
  );
  const invalidFileIds = jsonFileIds.filter(
    (fileId) => params.assetStatusByFileId.get(fileId) !== 'ACTIVE',
  );

  return {
    fieldName: params.fieldName,
    jsonItems,
    jsonFileIds,
    jsonWithoutReference,
    referenceWithoutJson,
    duplicateJsonIds,
    duplicateJsonOccurrences,
    invalidFileIds,
  };
}

/**
 * Computes the target snapshot item list for a reconcile action.
 * Deduplicates by fileId (first occurrence wins), drops removed fileIds and
 * appends rebuilt canonical references at the end. Items without a fileId
 * (legacy storedName-only entries) are preserved untouched.
 */
export function buildTargetSnapshotItems(
  items: unknown[],
  options: { appendFileIds: string[]; removeFileIds: ReadonlySet<string> },
): unknown[] {
  const seen = new Set<string>();
  const target: unknown[] = [];
  for (const item of items) {
    const fileId = attachmentFileId(item);
    if (fileId) {
      if (seen.has(fileId) || options.removeFileIds.has(fileId)) continue;
      seen.add(fileId);
    }
    target.push(item);
  }
  for (const fileId of options.appendFileIds) {
    if (seen.has(fileId)) continue;
    seen.add(fileId);
    target.push({ fileId });
  }
  return target;
}

export function stringifyInspectionDocumentSnapshot(
  items: unknown[],
): null | string {
  return items.length > 0 ? JSON.stringify(items) : null;
}

function collectDriftTypes(
  drift: InspectionDocumentFieldDrift,
): InspectionDocumentDriftType[] {
  const types: InspectionDocumentDriftType[] = [];
  if (drift.jsonWithoutReference.length > 0) {
    types.push('json_without_reference');
  }
  if (drift.referenceWithoutJson.length > 0) {
    types.push('reference_without_json');
  }
  if (drift.duplicateJsonIds.length > 0) {
    types.push('duplicate_json_id');
  }
  if (drift.invalidFileIds.length > 0) {
    types.push('invalid_file_id');
  }
  return types;
}

/**
 * Builds a deterministic reconcile plan entry for one inspection field.
 * Returns null when the field is consistent. The decision table:
 *
 * - json_without_reference + ACTIVE asset            -> REPAIR_REFERENCE
 * - json_without_reference + DELETED/MISSING asset   -> REMOVE_INVALID_SNAPSHOT
 * - json_without_reference + UNKNOWN asset           -> MANUAL_REVIEW
 * - reference_without_json + ACTIVE asset            -> REBUILD_SNAPSHOT
 * - reference_without_json + non-ACTIVE asset        -> MANUAL_REVIEW
 * - duplicate_json_id                                -> DEDUPE_SNAPSHOT
 * - invalid_file_id + existing canonical reference   -> MANUAL_REVIEW
 */
export function buildInspectionDocumentReconcilePlanEntry(params: {
  assetStatusByFileId: ReadonlyMap<string, InspectionDocumentAssetStatus>;
  fieldName: InspectionDocumentFieldName;
  inspectionId: string;
  referenceFileIds: string[];
  rollback: {
    documents: null | string;
    selfCheckDocuments: null | string;
  };
  snapshotValue: null | string;
}): InspectionDocumentReconcilePlanEntry | null {
  const drift = classifyInspectionDocumentField({
    assetStatusByFileId: params.assetStatusByFileId,
    fieldName: params.fieldName,
    referenceFileIds: params.referenceFileIds,
    snapshotValue: params.snapshotValue,
  });
  const driftTypes = collectDriftTypes(drift);
  if (driftTypes.length === 0) return null;

  const refSet = new Set(params.referenceFileIds);
  const assetStatus = (fileId: string): InspectionDocumentAssetStatus =>
    params.assetStatusByFileId.get(fileId) ?? 'UNKNOWN';

  // Per-JSON-fileId decision.
  const repairReferences: Array<{ fileId: string }> = [];
  const removeFileIds = new Set<string>();
  const jsonManualReview = new Set<string>();
  for (const fileId of drift.jsonFileIds) {
    const status = assetStatus(fileId);
    if (status === 'ACTIVE') {
      if (!refSet.has(fileId)) repairReferences.push({ fileId });
      continue;
    }
    if ((status === 'DELETED' || status === 'MISSING') && !refSet.has(fileId)) {
      removeFileIds.add(fileId);
      continue;
    }
    jsonManualReview.add(fileId);
  }

  // Reference-only fileIds missing from the snapshot.
  const appendFileIds = drift.referenceWithoutJson.filter(
    (fileId) => assetStatus(fileId) === 'ACTIVE',
  );
  const refManualReview = drift.referenceWithoutJson.filter(
    (fileId) => assetStatus(fileId) !== 'ACTIVE',
  );

  const requiresManualReview =
    jsonManualReview.size > 0 || refManualReview.length > 0;
  if (requiresManualReview) {
    return {
      inspectionId: params.inspectionId,
      fieldName: params.fieldName,
      driftTypes,
      proposedAction: 'MANUAL_REVIEW',
      requiresManualReview: true,
      confidence: 'LOW',
      reason: buildPlanReason(drift, jsonManualReview, refManualReview),
      before: extractFileIds(drift.jsonItems),
      after: extractFileIds(drift.jsonItems),
      removeFileIds: [],
      appendFileIds: [],
      repairReferences: [],
      rollback: params.rollback,
    };
  }

  const after = buildTargetSnapshotItems(drift.jsonItems, {
    appendFileIds,
    removeFileIds,
  });
  const proposedAction = resolveProposedAction({
    appendFileIds,
    hasDuplicates: drift.duplicateJsonIds.length > 0,
    hasRemoval: removeFileIds.size > 0,
    hasRepair: repairReferences.length > 0,
  });

  return {
    inspectionId: params.inspectionId,
    fieldName: params.fieldName,
    driftTypes,
    proposedAction,
    requiresManualReview: false,
    confidence: 'HIGH',
    reason: buildPlanReason(drift, new Set(), []),
    before: extractFileIds(drift.jsonItems),
    after: extractFileIds(after),
    removeFileIds: [...removeFileIds],
    appendFileIds,
    repairReferences,
    rollback: params.rollback,
  };
}

function extractFileIds(items: unknown[]): string[] {
  return items
    .map((item) => attachmentFileId(item))
    .filter((fileId) => fileId !== '');
}

function resolveProposedAction(options: {
  appendFileIds: string[];
  hasDuplicates: boolean;
  hasRemoval: boolean;
  hasRepair: boolean;
}): InspectionDocumentRepairAction {
  if (options.hasRepair) return 'REPAIR_REFERENCE';
  if (options.appendFileIds.length > 0) return 'REBUILD_SNAPSHOT';
  if (options.hasRemoval) return 'REMOVE_INVALID_SNAPSHOT';
  if (options.hasDuplicates) return 'DEDUPE_SNAPSHOT';
  return 'MANUAL_REVIEW';
}

function buildPlanReason(
  drift: InspectionDocumentFieldDrift,
  jsonManualReview: ReadonlySet<string>,
  refManualReview: string[],
): string {
  const parts: string[] = [];
  if (drift.jsonWithoutReference.length > 0) {
    parts.push(`json_without_reference(${drift.jsonWithoutReference.length})`);
  }
  if (drift.referenceWithoutJson.length > 0) {
    parts.push(`reference_without_json(${drift.referenceWithoutJson.length})`);
  }
  if (drift.duplicateJsonIds.length > 0) {
    parts.push(`duplicate_json_id(${drift.duplicateJsonIds.length})`);
  }
  if (drift.invalidFileIds.length > 0) {
    parts.push(`invalid_file_id(${drift.invalidFileIds.length})`);
  }
  if (jsonManualReview.size > 0 || refManualReview.length > 0) {
    const manual = [...jsonManualReview, ...refManualReview];
    parts.push(`manual_review(${manual.length})`);
  }
  return parts.join(' ');
}

export type InspectionDocumentApplyStatus =
  | 'ALREADY_CONSISTENT'
  | 'APPLIED'
  | 'INSPECTION_NOT_FOUND'
  | 'MANUAL_REVIEW_REQUIRED'
  | 'SKIPPED_CONCURRENT_CHANGE';

export interface InspectionDocumentRollback {
  inspectionId: string;
  fieldName: InspectionDocumentFieldName;
  runId: string;
  snapshot: {
    data: {
      documents: null | string;
      selfCheckDocuments: null | string;
    };
    /** Restore only when the row still equals the applied-after state. */
    where: {
      documents: null | string;
      id: string;
      selfCheckDocuments: null | string;
    };
  };
  createdReferences: Array<{
    bizId: string;
    bizType: string;
    fieldName: InspectionDocumentFieldName;
    fileId: string;
  }>;
}

export interface InspectionDocumentApplyResult {
  inspectionId: string;
  fieldName: InspectionDocumentFieldName;
  status: InspectionDocumentApplyStatus;
  driftTypes: InspectionDocumentDriftType[];
  action: InspectionDocumentRepairAction;
  reason: string;
  beforeDocuments: null | string;
  afterDocuments: null | string;
  beforeSelfCheckDocuments: null | string;
  afterSelfCheckDocuments: null | string;
  createdReferenceFileIds: string[];
  rollback: InspectionDocumentRollback | null;
  error?: string;
}

class InspectionDocumentConcurrentChangeError extends Error {
  constructor(inspectionId: string) {
    super(`inspection ${inspectionId} changed concurrently during reconcile`);
    this.name = 'InspectionDocumentConcurrentChangeError';
  }
}

/**
 * Applies one plan entry against the LIVE row state. The entry is
 * re-classified from the current snapshot + references so a re-run is
 * idempotent (already-fixed fields return ALREADY_CONSISTENT) and user edits
 * between plan and apply are never overwritten: the snapshot CAS anchors both
 * JSON columns, and a concurrent change rolls the whole transaction back
 * (SKIPPED_CONCURRENT_CHANGE). Manual-review entries are never written.
 */
export async function applyInspectionDocumentReconcileEntry(params: {
  assetStatusByFileId: ReadonlyMap<string, InspectionDocumentAssetStatus>;
  currentInspection: {
    documents: null | string;
    id: string;
    selfCheckDocuments: null | string;
  };
  db: Pick<PrismaClient, '$transaction' | 'file_references' | 'inspections'>;
  entry: InspectionDocumentReconcilePlanEntry;
  referenceFileIds: string[];
  runId: string;
}): Promise<InspectionDocumentApplyResult> {
  const { currentInspection, entry } = params;
  const before = {
    documents: currentInspection.documents,
    selfCheckDocuments: currentInspection.selfCheckDocuments,
  };
  const baseResult = {
    inspectionId: entry.inspectionId,
    fieldName: entry.fieldName,
    beforeDocuments: before.documents,
    beforeSelfCheckDocuments: before.selfCheckDocuments,
    afterDocuments: before.documents,
    afterSelfCheckDocuments: before.selfCheckDocuments,
    createdReferenceFileIds: [],
    rollback: null,
  };

  if (entry.requiresManualReview) {
    return {
      ...baseResult,
      status: 'MANUAL_REVIEW_REQUIRED' as const,
      driftTypes: entry.driftTypes,
      action: entry.proposedAction,
      reason: entry.reason,
    };
  }

  const livePlan = buildInspectionDocumentReconcilePlanEntry({
    assetStatusByFileId: params.assetStatusByFileId,
    fieldName: entry.fieldName,
    inspectionId: entry.inspectionId,
    referenceFileIds: params.referenceFileIds,
    rollback: before,
    snapshotValue: currentInspection[entry.fieldName],
  });
  if (!livePlan) {
    return {
      ...baseResult,
      status: 'ALREADY_CONSISTENT' as const,
      driftTypes: [],
      action: entry.proposedAction,
      reason: 'no live drift for the approved inspection/field',
    };
  }
  if (livePlan.requiresManualReview) {
    return {
      ...baseResult,
      status: 'MANUAL_REVIEW_REQUIRED' as const,
      driftTypes: livePlan.driftTypes,
      action: livePlan.proposedAction,
      reason: livePlan.reason,
    };
  }

  const drift = classifyInspectionDocumentField({
    assetStatusByFileId: params.assetStatusByFileId,
    fieldName: entry.fieldName,
    referenceFileIds: params.referenceFileIds,
    snapshotValue: currentInspection[entry.fieldName],
  });
  const targetItems = buildTargetSnapshotItems(drift.jsonItems, {
    appendFileIds: livePlan.appendFileIds,
    removeFileIds: new Set(livePlan.removeFileIds),
  });
  const targetValue = stringifyInspectionDocumentSnapshot(targetItems);
  const after =
    entry.fieldName === 'documents'
      ? {
          documents: targetValue,
          selfCheckDocuments: before.selfCheckDocuments,
        }
      : { documents: before.documents, selfCheckDocuments: targetValue };

  try {
    await params.db.$transaction(async (tx) => {
      if (livePlan.repairReferences.length > 0) {
        const baseSortOrder = params.referenceFileIds.length;
        await tx.file_references.createMany({
          data: livePlan.repairReferences.map((reference, index) => ({
            bizId: entry.inspectionId,
            bizType: 'inspection_record',
            fieldName: entry.fieldName,
            fileId: reference.fileId,
            sortOrder: baseSortOrder + index,
          })),
          skipDuplicates: true,
        });
      }
      const result = await tx.inspections.updateMany({
        data: after,
        where: {
          id: entry.inspectionId,
          documents: before.documents,
          selfCheckDocuments: before.selfCheckDocuments,
        },
      });
      if (result.count !== 1) {
        throw new InspectionDocumentConcurrentChangeError(entry.inspectionId);
      }
    });
  } catch (error) {
    if (error instanceof InspectionDocumentConcurrentChangeError) {
      return {
        ...baseResult,
        status: 'SKIPPED_CONCURRENT_CHANGE' as const,
        driftTypes: livePlan.driftTypes,
        action: livePlan.proposedAction,
        reason:
          'snapshot CAS count=0, concurrent user change; next round retries',
      };
    }
    throw error;
  }

  const createdReferenceFileIds = livePlan.repairReferences.map(
    (reference) => reference.fileId,
  );
  return {
    ...baseResult,
    status: 'APPLIED' as const,
    driftTypes: livePlan.driftTypes,
    action: livePlan.proposedAction,
    reason: livePlan.reason,
    afterDocuments: after.documents,
    afterSelfCheckDocuments: after.selfCheckDocuments,
    createdReferenceFileIds,
    rollback: {
      inspectionId: entry.inspectionId,
      fieldName: entry.fieldName,
      runId: params.runId,
      snapshot: {
        where: { id: entry.inspectionId, ...after },
        data: {
          documents: before.documents,
          selfCheckDocuments: before.selfCheckDocuments,
        },
      },
      createdReferences: createdReferenceFileIds.map((fileId) => ({
        bizId: entry.inspectionId,
        bizType: 'inspection_record',
        fieldName: entry.fieldName,
        fileId,
      })),
    },
  };
}
