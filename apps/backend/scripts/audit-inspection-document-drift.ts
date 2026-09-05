import type {
  InspectionDocumentDriftType,
  InspectionDocumentFieldName,
} from './inspection-document-drift-core';

import { writeFileSync } from 'node:fs';
import process from 'node:process';

import { PrismaClient } from '@prisma/client';
import { resolveAttachmentLookup } from '~/modules/file-storage/file-attachment';
import { createModuleLogger } from '~/utils/logger';

import {
  classifyInspectionDocumentField,
  collectInspectionDocumentFileIds,
} from './inspection-document-drift-core';

/**
 * Read-only drift audit between the inspections documents JSON snapshot
 * columns and the canonical `file_references` rows (CLOSE-EFFECTS-INTEGRITY-
 * 001 / CLOSE-EFFECTS-RECONCILE-001). `file_references(bizType=
 * inspection_record, fieldName=documents | selfCheckDocuments)` is the
 * canonical file-lifecycle source; the JSON columns are the compatibility
 * snapshot. This script only reports mismatches, it never writes and never
 * touches OSS/local storage.
 *
 * Reported categories per inspection:
 *   json_without_reference  JSON attachment has no file_reference row
 *   reference_without_json  file_reference has no JSON attachment entry
 *   duplicate_json_id       same fileId appears more than once in one field
 *   invalid_file_id         JSON fileId does not resolve to an active asset
 *
 * Usage:
 *   pnpm --dir apps/backend run audit:inspection-document-drift
 *   pnpm --dir apps/backend run audit:inspection-document-drift -- --json
 *     --limit 5000 --after-id <cursor> --output-file drift.ndjson
 */

const logger = createModuleLogger('AuditInspectionDocumentDrift');
const prisma = new PrismaClient();
const DEFAULT_BATCH_SIZE = 200;
const REFERENCE_FIELDS: readonly InspectionDocumentFieldName[] = [
  'documents',
  'selfCheckDocuments',
];

interface AuditInspectionDocumentDriftOptions {
  afterId?: string;
  batchSize: number;
  json: boolean;
  limit?: number;
  outputFile?: string;
}

export function parseAuditInspectionDocumentDriftOptions(
  args: string[],
): AuditInspectionDocumentDriftOptions {
  let batchSize = DEFAULT_BATCH_SIZE;
  let json = false;
  let limit: number | undefined;
  let afterId: string | undefined;
  let outputFile: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--after-id': {
        afterId = args[++index];

        break;
      }
      case '--batch-size': {
        batchSize = Number(args[++index]);
        if (!Number.isFinite(batchSize) || batchSize < 1) {
          throw new Error('--batch-size must be a positive integer');
        }

        break;
      }
      case '--json': {
        json = true;

        break;
      }
      case '--limit': {
        limit = Number(args[++index]);
        if (!Number.isFinite(limit) || limit < 1) {
          throw new Error('--limit must be a positive integer');
        }

        break;
      }
      case '--output-file': {
        outputFile = args[++index];

        break;
      }
      default: {
        throw new Error(`unknown argument: ${arg}`);
      }
    }
  }
  return { afterId, batchSize, json, limit, outputFile };
}

interface AuditDriftRecord {
  canonicalReference: null | string;
  detectedAt: string;
  driftType: InspectionDocumentDriftType;
  fieldName: InspectionDocumentFieldName;
  fileId: string;
  inspectionId: string;
  snapshotValue: null | string;
  url: string;
}

function attachmentUrl(item: unknown): string {
  if (!item || typeof item !== 'object') return '';
  return String((item as Record<string, unknown>).url ?? '');
}

function findItemUrl(items: unknown[], fileId: string): string {
  for (const item of items) {
    const lookup = resolveAttachmentLookup(item);
    if ('fileId' in lookup && lookup.fileId === fileId) {
      return attachmentUrl(item);
    }
  }
  return '';
}

async function main() {
  const options = parseAuditInspectionDocumentDriftOptions(
    process.argv.slice(2),
  );
  const detectedAt = new Date().toISOString();
  let cursor = options.afterId ?? '';
  const totals = {
    inspections: 0,
    jsonWithoutReference: 0,
    referenceWithoutJson: 0,
    duplicateJsonId: 0,
    invalidFileId: 0,
  };
  const records: AuditDriftRecord[] = [];

  for (;;) {
    const remaining =
      options.limit === undefined
        ? options.batchSize
        : options.limit - totals.inspections;
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
    totals.inspections += inspections.length;

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
      Map<InspectionDocumentFieldName, Set<string>>
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
        fileIds = new Set();
        byField.set(fieldName, fileIds);
      }
      fileIds.add(reference.fileId);
    }

    const batchJsonFileIds = new Set<string>();
    for (const inspection of inspections) {
      for (const fieldName of REFERENCE_FIELDS) {
        const snapshotValue = inspection[fieldName];
        const fieldRefs = refsByBizAndField.get(inspection.id)?.get(fieldName);
        const drift = classifyInspectionDocumentField({
          assetStatusByFileId: new Map(),
          fieldName,
          referenceFileIds: fieldRefs ? [...fieldRefs] : [],
          snapshotValue,
        });
        totals.jsonWithoutReference += drift.jsonWithoutReference.length;
        totals.referenceWithoutJson += drift.referenceWithoutJson.length;
        totals.duplicateJsonId += drift.duplicateJsonOccurrences;
        for (const fileId of drift.jsonFileIds) batchJsonFileIds.add(fileId);

        for (const fileId of drift.jsonWithoutReference) {
          records.push({
            canonicalReference: null,
            detectedAt,
            driftType: 'json_without_reference',
            fieldName,
            fileId,
            inspectionId: inspection.id,
            snapshotValue,
            url: findItemUrl(drift.jsonItems, fileId),
          });
        }
        for (const fileId of drift.referenceWithoutJson) {
          records.push({
            canonicalReference: fileId,
            detectedAt,
            driftType: 'reference_without_json',
            fieldName,
            fileId,
            inspectionId: inspection.id,
            snapshotValue,
            url: '',
          });
        }
        for (const fileId of drift.duplicateJsonIds) {
          records.push({
            canonicalReference: fieldRefs?.has(fileId) ? fileId : null,
            detectedAt,
            driftType: 'duplicate_json_id',
            fieldName,
            fileId,
            inspectionId: inspection.id,
            snapshotValue,
            url: findItemUrl(drift.jsonItems, fileId),
          });
        }
      }
    }

    if (batchJsonFileIds.size > 0) {
      const assets = await prisma.file_assets.findMany({
        select: { id: true, status: true },
        where: { id: { in: [...batchJsonFileIds] } },
      });
      const statusById = new Map(
        assets.map((asset) => [asset.id, asset.status]),
      );
      for (const fileId of batchJsonFileIds) {
        if (statusById.get(fileId) === 'ACTIVE') continue;
        totals.invalidFileId += 1;
        const inspection = inspections.find((item) =>
          collectInspectionDocumentFileIds(item.documents).includes(fileId),
        );
        const fieldName: InspectionDocumentFieldName = inspection
          ? 'documents'
          : 'selfCheckDocuments';
        records.push({
          canonicalReference: null,
          detectedAt,
          driftType: 'invalid_file_id',
          fieldName,
          fileId,
          inspectionId: inspection?.id ?? '',
          snapshotValue: inspection ? inspection[fieldName] : null,
          url: '',
        });
      }
    }
  }

  if (options.json) {
    const lines = records.map((record) => JSON.stringify(record)).join('\n');
    if (options.outputFile) {
      writeFileSync(options.outputFile, `${lines}${lines ? '\n' : ''}`, 'utf8');
    } else {
      process.stdout.write(`${lines}${lines ? '\n' : ''}`);
    }
    console.error(
      `summary inspections=${totals.inspections} json_without_reference=${totals.jsonWithoutReference} reference_without_json=${totals.referenceWithoutJson} duplicate_json_id=${totals.duplicateJsonId} invalid_file_id=${totals.invalidFileId} records=${records.length}`,
    );
    return;
  }

  logger.info(
    'inspection 文档 JSON 快照 ↔ file_references 存量漂移审计（只读）',
  );
  logger.info(`检查检验记录数: ${totals.inspections}`);
  logger.info(`JSON 有但 reference 无: ${totals.jsonWithoutReference}`);
  logger.info(`reference 有但 JSON 无: ${totals.referenceWithoutJson}`);
  logger.info(`重复 attachment fileId: ${totals.duplicateJsonId}`);
  logger.info(`无效 fileId（无 ACTIVE 资产）: ${totals.invalidFileId}`);
  logger.info(
    totals.jsonWithoutReference === 0 &&
      totals.referenceWithoutJson === 0 &&
      totals.duplicateJsonId === 0 &&
      totals.invalidFileId === 0
      ? '结论: 无漂移'
      : '结论: 存在漂移，登记 CLOSE-EFFECTS-RECONCILE-001 后再决定修复方案',
  );
}

main()
  .catch((error: unknown) => {
    logger.error(error as Error, 'inspection document drift audit failed');
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
