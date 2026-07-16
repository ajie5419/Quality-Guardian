import type { inspection_category } from '@prisma/client';

import process from 'node:process';

export type BackfillMode = 'apply' | 'dry-run';

export interface SupplierIdentity {
  id: string;
  name: string;
}

export interface QualityRecordIdentityInput {
  existingSupplier: null | SupplierIdentity;
  existingSupplierId: null | string;
  existingSupplierName: null | string;
  inspection: null | {
    category: inspection_category;
    processSupplier: null | SupplierIdentity;
    supplierById: null | SupplierIdentity;
    supplierByName: null | SupplierIdentity;
  };
  supplierByRecordName: null | SupplierIdentity;
}

export type SupplierIdentityResolution =
  | {
      action: 'conflict';
      candidate: SupplierIdentity;
      reason: 'CONFLICTING_IDENTITY';
    }
  | {
      action: 'skip';
      reason: 'EXISTING_VALID_ID' | 'NO_SUPPLIER_IDENTITY_REQUIRED';
    }
  | {
      action: 'unresolved';
      reason:
        | 'INVALID_EXISTING_ID'
        | 'MISSING_PROCESS_TEAM_LINK'
        | 'NO_IDENTITY_EVIDENCE'
        | 'UNSUPPORTED_INSPECTION_CATEGORY';
    }
  | {
      action: 'update';
      candidate: SupplierIdentity;
      reason:
        | 'INCOMING_INSPECTION_ID'
        | 'INCOMING_INSPECTION_NAME'
        | 'PROCESS_TEAM_LINK'
        | 'QUALITY_RECORD_NAME';
    };

export interface BackfillOptions {
  batchSize: number;
  maxBatches?: number;
  mode: BackfillMode;
}

export function buildUniqueIdentityMap<T extends { name: string }>(items: T[]) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const values = grouped.get(item.name) || [];
    values.push(item);
    grouped.set(item.name, values);
  }
  const unique = new Map<string, T>();
  for (const [name, values] of grouped) {
    const candidate = values[0];
    if (values.length === 1 && candidate) {
      unique.set(name, candidate);
    }
  }
  return unique;
}

const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 1000;

function parsePositiveInteger(value: string | undefined, flag: string) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

export function parseBackfillOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): BackfillOptions {
  let mode: BackfillMode =
    env.SUPPLIER_IDENTITY_BACKFILL_MODE === 'apply' ? 'apply' : 'dry-run';
  let batchSize = parsePositiveInteger(
    env.SUPPLIER_IDENTITY_BACKFILL_BATCH,
    'SUPPLIER_IDENTITY_BACKFILL_BATCH',
  );
  let maxBatches = parsePositiveInteger(
    env.SUPPLIER_IDENTITY_BACKFILL_MAX_BATCHES,
    'SUPPLIER_IDENTITY_BACKFILL_MAX_BATCHES',
  );

  for (const arg of args) {
    if (arg === '--apply') mode = 'apply';
    else if (arg === '--dry-run') mode = 'dry-run';
    else if (arg.startsWith('--mode=')) {
      const value = arg.slice('--mode='.length);
      if (value !== 'apply' && value !== 'dry-run') {
        throw new Error('--mode must be apply or dry-run');
      }
      mode = value;
    } else if (arg.startsWith('--batch-size=')) {
      batchSize = parsePositiveInteger(
        arg.slice('--batch-size='.length),
        '--batch-size',
      );
    } else if (arg.startsWith('--max-batches=')) {
      maxBatches = parsePositiveInteger(
        arg.slice('--max-batches='.length),
        '--max-batches',
      );
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return {
    batchSize: Math.min(batchSize ?? DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE),
    ...(maxBatches ? { maxBatches } : {}),
    mode,
  };
}

function resolveInspectionCandidate(
  inspection: NonNullable<QualityRecordIdentityInput['inspection']>,
) {
  if (inspection.category === 'INCOMING') {
    if (inspection.supplierById) {
      return {
        candidate: inspection.supplierById,
        reason: 'INCOMING_INSPECTION_ID' as const,
      };
    }
    if (inspection.supplierByName) {
      return {
        candidate: inspection.supplierByName,
        reason: 'INCOMING_INSPECTION_NAME' as const,
      };
    }
    return null;
  }
  if (inspection.category === 'PROCESS' && inspection.processSupplier) {
    return {
      candidate: inspection.processSupplier,
      reason: 'PROCESS_TEAM_LINK' as const,
    };
  }
  return null;
}

export function resolveQualityRecordSupplierIdentity(
  input: QualityRecordIdentityInput,
): SupplierIdentityResolution {
  const inspectionCandidate = input.inspection
    ? resolveInspectionCandidate(input.inspection)
    : null;

  if (input.existingSupplier) {
    if (
      inspectionCandidate &&
      inspectionCandidate.candidate.id !== input.existingSupplier.id
    ) {
      return {
        action: 'conflict',
        candidate: inspectionCandidate.candidate,
        reason: 'CONFLICTING_IDENTITY',
      };
    }
    return { action: 'skip', reason: 'EXISTING_VALID_ID' };
  }

  if (inspectionCandidate) {
    return { action: 'update', ...inspectionCandidate };
  }

  if (input.inspection?.category === 'PROCESS') {
    if (!input.existingSupplierId && !input.existingSupplierName) {
      return { action: 'skip', reason: 'NO_SUPPLIER_IDENTITY_REQUIRED' };
    }
    return { action: 'unresolved', reason: 'MISSING_PROCESS_TEAM_LINK' };
  }
  if (input.inspection?.category === 'SHIPMENT') {
    if (!input.existingSupplierId && !input.existingSupplierName) {
      return { action: 'skip', reason: 'NO_SUPPLIER_IDENTITY_REQUIRED' };
    }
    return {
      action: 'unresolved',
      reason: 'UNSUPPORTED_INSPECTION_CATEGORY',
    };
  }
  if (input.supplierByRecordName) {
    return {
      action: 'update',
      candidate: input.supplierByRecordName,
      reason: 'QUALITY_RECORD_NAME',
    };
  }
  if (!input.existingSupplierId && !input.existingSupplierName) {
    return { action: 'skip', reason: 'NO_SUPPLIER_IDENTITY_REQUIRED' };
  }
  return {
    action: 'unresolved',
    reason: input.existingSupplierId
      ? 'INVALID_EXISTING_ID'
      : 'NO_IDENTITY_EVIDENCE',
  };
}
