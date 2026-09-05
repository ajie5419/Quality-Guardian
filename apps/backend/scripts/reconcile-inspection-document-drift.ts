import type {
  InspectionDocumentApplyResult,
  InspectionDocumentAssetStatus,
  InspectionDocumentFieldName,
  InspectionDocumentReconcilePlan,
  InspectionDocumentReconcilePlanEntry,
} from './inspection-document-drift-core';

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import {
  applyInspectionDocumentReconcileEntry,
  buildInspectionDocumentReconcilePlanEntry,
  collectInspectionDocumentFileIds,
} from './inspection-document-drift-core';

/**
 * Controlled repair tool for inspection document drift (CLOSE-EFFECTS-
 * RECONCILE-001). Production flow is strictly audit -> plan -> review ->
 * apply: the default is a read-only dry-run that only emits a plan; --apply
 * requires --plan-file and re-validates every entry against the live row
 * before an atomic CAS write. The tool never scans-and-repairs in one command
 * and never touches OSS/local storage.
 */

const logger = createModuleLogger('ReconcileInspectionDocumentDrift');
const DEFAULT_BATCH_SIZE = 200;
const PLAN_VERSION = 1 as const;
const REFERENCE_FIELDS: readonly InspectionDocumentFieldName[] = [
  'documents',
  'selfCheckDocuments',
];
const ACTOR = 'system:inspection-document-reconcile';

export interface InspectionDocumentReconcileOptions {
  mode: 'apply' | 'dry-run';
  batchSize: number;
  limit?: number;
  afterId?: string;
  planFile?: string;
  reportFile?: string;
}

export function parseInspectionDocumentReconcileOptions(
  args: string[],
): InspectionDocumentReconcileOptions {
  let mode: 'apply' | 'dry-run' = 'dry-run';
  let batchSize = DEFAULT_BATCH_SIZE;
  let limit: number | undefined;
  let afterId: string | undefined;
  let planFile: string | undefined;
  let reportFile: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--after-id': {
        afterId = args[++index];

        break;
      }
      case '--apply': {
        mode = 'apply';

        break;
      }
      case '--batch-size': {
        batchSize = Number(args[++index]);
        if (!Number.isFinite(batchSize) || batchSize < 1) {
          throw new Error('--batch-size must be a positive integer');
        }

        break;
      }
      case '--dry-run': {
        mode = 'dry-run';

        break;
      }
      case '--limit': {
        limit = Number(args[++index]);
        if (!Number.isFinite(limit) || limit < 1) {
          throw new Error('--limit must be a positive integer');
        }

        break;
      }
      case '--plan-file': {
        planFile = args[++index];

        break;
      }
      case '--report-file': {
        reportFile = args[++index];

        break;
      }
      default: {
        throw new Error(`unknown argument: ${arg}`);
      }
    }
  }
  if (mode === 'apply' && !planFile) {
    throw new Error(
      '--apply requires --plan-file (audit -> plan -> review -> apply)',
    );
  }
  return { mode, batchSize, limit, afterId, planFile, reportFile };
}

function collectBatchAssetIds(
  inspections: Array<{
    documents: null | string;
    selfCheckDocuments: null | string;
  }>,
  referenceFileIds: string[],
): string[] {
  const ids = new Set(referenceFileIds);
  for (const inspection of inspections) {
    for (const fileId of collectInspectionDocumentFileIds(
      inspection.documents,
    )) {
      ids.add(fileId);
    }
    for (const fileId of collectInspectionDocumentFileIds(
      inspection.selfCheckDocuments,
    )) {
      ids.add(fileId);
    }
  }
  return [...ids];
}

async function loadAssetStatuses(
  fileIds: string[],
): Promise<Map<string, InspectionDocumentAssetStatus>> {
  if (fileIds.length === 0) return new Map();
  const assets = await prisma.file_assets.findMany({
    select: { id: true, status: true },
    where: { id: { in: fileIds } },
  });
  return new Map(assets.map((asset) => [asset.id, asset.status]));
}

/**
 * Read-only scan over inspections in bounded batches (id cursor). Emits a
 * deterministic plan; never writes.
 */
export async function scanInspectionDocumentDrift(
  options: InspectionDocumentReconcileOptions,
): Promise<{
  entries: InspectionDocumentReconcilePlanEntry[];
  scanned: number;
}> {
  let cursor = options.afterId ?? '';
  const entries: InspectionDocumentReconcilePlanEntry[] = [];
  let scanned = 0;

  for (;;) {
    const remaining =
      options.limit === undefined ? options.batchSize : options.limit - scanned;
    if (remaining <= 0) break;
    const take = Math.min(options.batchSize, remaining);
    const inspections = await prisma.inspections.findMany({
      orderBy: { id: 'asc' },
      select: { documents: true, id: true, selfCheckDocuments: true },
      take,
      where: {
        ...(cursor ? { id: { gt: cursor } } : {}),
        isDeleted: false,
      },
    });
    if (inspections.length === 0) break;
    cursor = inspections[inspections.length - 1].id;
    scanned += inspections.length;

    const ids = inspections.map((inspection) => inspection.id);
    const references = await prisma.file_references.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { bizId: true, fieldName: true, fileId: true },
      where: {
        bizId: { in: ids },
        bizType: 'inspection_record',
        fieldName: { in: [...REFERENCE_FIELDS] },
      },
    });
    const refsByBizAndField = new Map<
      string,
      Map<InspectionDocumentFieldName, string[]>
    >();
    for (const reference of references) {
      const fieldName = reference.fieldName as InspectionDocumentFieldName;
      let byField = refsByBizAndField.get(reference.bizId);
      if (!byField) {
        byField = new Map();
        refsByBizAndField.set(reference.bizId, byField);
      }
      let fileIds = byField.get(fieldName);
      if (!fileIds) {
        fileIds = [];
        byField.set(fieldName, fileIds);
      }
      fileIds.push(reference.fileId);
    }

    const assetStatusByFileId = await loadAssetStatuses(
      collectBatchAssetIds(
        inspections,
        references.map((r) => r.fileId),
      ),
    );
    for (const inspection of inspections) {
      const rollback = {
        documents: inspection.documents,
        selfCheckDocuments: inspection.selfCheckDocuments,
      };
      for (const fieldName of REFERENCE_FIELDS) {
        const entry = buildInspectionDocumentReconcilePlanEntry({
          assetStatusByFileId,
          fieldName,
          inspectionId: inspection.id,
          referenceFileIds:
            refsByBizAndField.get(inspection.id)?.get(fieldName) ?? [],
          rollback,
          snapshotValue: inspection[fieldName],
        });
        if (entry) entries.push(entry);
      }
    }
  }

  return { entries, scanned };
}

export function writeReconcilePlanFile(
  filePath: string,
  plan: InspectionDocumentReconcilePlan,
) {
  writeFileSync(filePath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
}

export function loadReconcilePlanFile(
  filePath: string,
): InspectionDocumentReconcilePlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    logger.error({ err: error, filePath }, 'cannot read reconcile plan file');
    throw new Error(`cannot read plan file ${filePath}: ${String(error)}`);
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as { version?: unknown }).version !== PLAN_VERSION ||
    !Array.isArray((parsed as { entries?: unknown }).entries)
  ) {
    throw new Error(
      `invalid plan file ${filePath}: expected { version: 1, entries: [] }`,
    );
  }
  return parsed as InspectionDocumentReconcilePlan;
}

async function applyPlanEntryWithFreshState(
  entry: InspectionDocumentReconcilePlanEntry,
  runId: string,
): Promise<InspectionDocumentApplyResult> {
  const inspection = await prisma.inspections.findFirst({
    select: { documents: true, id: true, selfCheckDocuments: true },
    where: { id: entry.inspectionId, isDeleted: false },
  });
  const base = {
    inspectionId: entry.inspectionId,
    fieldName: entry.fieldName,
    driftTypes: entry.driftTypes,
    action: entry.proposedAction,
    reason: 'inspection not found or soft-deleted',
    beforeDocuments: null,
    afterDocuments: null,
    beforeSelfCheckDocuments: null,
    afterSelfCheckDocuments: null,
    createdReferenceFileIds: [],
    rollback: null,
  };
  if (!inspection) {
    return { ...base, status: 'INSPECTION_NOT_FOUND' as const };
  }

  const references = await prisma.file_references.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: { fileId: true },
    where: {
      bizId: entry.inspectionId,
      bizType: 'inspection_record',
      fieldName: entry.fieldName,
    },
  });
  const referenceFileIds = references.map((reference) => reference.fileId);
  const assetStatusByFileId = await loadAssetStatuses(
    collectBatchAssetIds([inspection], referenceFileIds),
  );
  return applyInspectionDocumentReconcileEntry({
    assetStatusByFileId,
    currentInspection: inspection,
    db: prisma,
    entry,
    referenceFileIds,
    runId,
  });
}

function printPlanSummary(
  plan: InspectionDocumentReconcilePlan,
  scanned: number,
) {
  const byAction = new Map<string, number>();
  const byDrift = new Map<string, number>();
  const manualReview: string[] = [];
  for (const entry of plan.entries) {
    byAction.set(
      entry.proposedAction,
      (byAction.get(entry.proposedAction) ?? 0) + 1,
    );
    for (const driftType of entry.driftTypes) {
      byDrift.set(driftType, (byDrift.get(driftType) ?? 0) + 1);
    }
    if (entry.requiresManualReview && manualReview.length < 20) {
      manualReview.push(`${entry.inspectionId}/${entry.fieldName}`);
    }
  }
  logger.info(
    `inspection 文档漂移计划（dry-run，未写入）: ${plan.entries.length} 条`,
  );
  logger.info(`扫描检验记录: ${scanned}`);
  for (const [action, count] of [...byAction.entries()].sort()) {
    logger.info(`  按动作 ${action}: ${count}`);
  }
  for (const [driftType, count] of [...byDrift.entries()].sort()) {
    logger.info(`  按漂移 ${driftType}: ${count}`);
  }
  if (manualReview.length > 0) {
    logger.info('  需人工审核（样例最多 20）:');
    for (const sample of manualReview) logger.info(`    ${sample}`);
  }
}

function printApplySummary(results: InspectionDocumentApplyResult[]) {
  const byStatus = new Map<string, number>();
  for (const result of results) {
    byStatus.set(result.status, (byStatus.get(result.status) ?? 0) + 1);
  }
  logger.info(`inspection 文档漂移修复: ${results.length} 条`);
  for (const [status, count] of [...byStatus.entries()].sort()) {
    logger.info(`  ${status}: ${count}`);
  }
}

export async function runInspectionDocumentReconcile(
  options: InspectionDocumentReconcileOptions,
): Promise<{
  plan?: InspectionDocumentReconcilePlan;
  results?: InspectionDocumentApplyResult[];
}> {
  if (options.mode === 'dry-run') {
    const { entries, scanned } = await scanInspectionDocumentDrift(options);
    const plan: InspectionDocumentReconcilePlan = {
      version: PLAN_VERSION,
      generatedAt: new Date().toISOString(),
      entries,
    };
    if (options.planFile) writeReconcilePlanFile(options.planFile, plan);
    printPlanSummary(plan, scanned);
    return { plan };
  }

  const plan = loadReconcilePlanFile(options.planFile as string);
  const runId = `reconcile-${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const results: InspectionDocumentApplyResult[] = [];
  for (const entry of plan.entries) {
    const result = await applyPlanEntryWithFreshState(entry, runId);
    results.push(result);
    logger.info(
      {
        inspectionId: entry.inspectionId,
        fieldName: entry.fieldName,
        status: result.status,
        runId,
      },
      `inspection document reconcile ${result.status}`,
    );
  }
  const report = {
    version: PLAN_VERSION,
    runId,
    actor: ACTOR,
    mode: 'apply' as const,
    timestamp: new Date().toISOString(),
    results,
  };
  if (options.reportFile) {
    writeFileSync(
      options.reportFile,
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
  }
  printApplySummary(results);
  return { results };
}

async function main() {
  const options = parseInspectionDocumentReconcileOptions(
    process.argv.slice(2),
  );
  await runInspectionDocumentReconcile(options);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main()
    .catch((error: unknown) => {
      logger.error(error as Error, 'inspection document reconcile failed');
      process.exitCode = 1;
    })
    .finally(() => {
      void prisma.$disconnect();
    });
}
