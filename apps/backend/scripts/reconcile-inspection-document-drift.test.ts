import type {
  InspectionDocumentAssetStatus,
  InspectionDocumentReconcilePlan,
} from './inspection-document-drift-core';

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import {
  applyInspectionDocumentReconcileEntry,
  buildInspectionDocumentReconcilePlanEntry,
  buildTargetSnapshotItems,
  classifyInspectionDocumentField,
  stringifyInspectionDocumentSnapshot,
} from './inspection-document-drift-core';
import {
  loadReconcilePlanFile,
  parseInspectionDocumentReconcileOptions,
  scanInspectionDocumentDrift,
  writeReconcilePlanFile,
} from './reconcile-inspection-document-drift';

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn(),
    file_assets: { findMany: vi.fn() },
    file_references: { createMany: vi.fn(), findMany: vi.fn() },
    inspections: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  },
}));

function statusMap(
  entries: Array<[string, InspectionDocumentAssetStatus]>,
): Map<string, InspectionDocumentAssetStatus> {
  return new Map(entries);
}

function buildEntry(
  overrides: {
    assetStatusByFileId?: Map<string, InspectionDocumentAssetStatus>;
    fieldName?: 'documents' | 'selfCheckDocuments';
    inspectionId?: string;
    referenceFileIds?: string[];
    snapshotValue?: null | string;
  } = {},
) {
  return buildInspectionDocumentReconcilePlanEntry({
    assetStatusByFileId: overrides.assetStatusByFileId ?? new Map(),
    fieldName: overrides.fieldName ?? 'documents',
    inspectionId: overrides.inspectionId ?? 'inspection-1',
    referenceFileIds: overrides.referenceFileIds ?? [],
    rollback: { documents: null, selfCheckDocuments: null },
    snapshotValue: overrides.snapshotValue ?? null,
  });
}

describe('inspection document drift classification', () => {
  it('parses the snapshot and reports duplicates and missing references', () => {
    const drift = classifyInspectionDocumentField({
      assetStatusByFileId: statusMap([['f1', 'ACTIVE']]),
      fieldName: 'documents',
      referenceFileIds: ['f1'],
      snapshotValue: JSON.stringify([
        { fileId: 'f1', url: 'https://cdn/f1.png' },
        { fileId: 'f1' },
        { fileId: 'f2' },
      ]),
    });
    expect(drift.jsonFileIds).toEqual(['f1', 'f2']);
    expect(drift.duplicateJsonIds).toEqual(['f1']);
    expect(drift.duplicateJsonOccurrences).toBe(1);
    expect(drift.jsonWithoutReference).toEqual(['f2']);
    expect(drift.referenceWithoutJson).toEqual([]);
  });

  it('returns null for a consistent field', () => {
    expect(
      buildEntry({
        assetStatusByFileId: statusMap([['f1', 'ACTIVE']]),
        referenceFileIds: ['f1'],
        snapshotValue: JSON.stringify([{ fileId: 'f1' }]),
      }),
    ).toBeNull();
  });

  it('classifies json_without_reference with an ACTIVE asset as REPAIR_REFERENCE', () => {
    const entry = buildEntry({
      assetStatusByFileId: statusMap([['f1', 'ACTIVE']]),
      snapshotValue: JSON.stringify([{ fileId: 'f1' }]),
    });
    expect(entry).toMatchObject({
      after: ['f1'],
      before: ['f1'],
      driftTypes: ['json_without_reference'],
      proposedAction: 'REPAIR_REFERENCE',
      repairReferences: [{ fileId: 'f1' }],
      requiresManualReview: false,
    });
  });

  it('classifies reference_without_json with an ACTIVE asset as REBUILD_SNAPSHOT', () => {
    const entry = buildEntry({
      assetStatusByFileId: statusMap([['r1', 'ACTIVE']]),
      referenceFileIds: ['r1'],
    });
    expect(entry).toMatchObject({
      appendFileIds: ['r1'],
      after: ['r1'],
      before: [],
      driftTypes: ['reference_without_json'],
      proposedAction: 'REBUILD_SNAPSHOT',
      requiresManualReview: false,
    });
  });

  it('classifies duplicate_json_id as DEDUPE_SNAPSHOT', () => {
    const entry = buildEntry({
      assetStatusByFileId: statusMap([['d1', 'ACTIVE']]),
      referenceFileIds: ['d1'],
      snapshotValue: JSON.stringify([{ fileId: 'd1' }, { fileId: 'd1' }]),
    });
    expect(entry).toMatchObject({
      after: ['d1'],
      before: ['d1', 'd1'],
      driftTypes: ['duplicate_json_id'],
      proposedAction: 'DEDUPE_SNAPSHOT',
      requiresManualReview: false,
    });
  });

  it('classifies a DELETED asset without a reference as REMOVE_INVALID_SNAPSHOT', () => {
    const entry = buildEntry({
      assetStatusByFileId: statusMap([['g1', 'DELETED']]),
      snapshotValue: JSON.stringify([{ fileId: 'g1' }]),
    });
    expect(entry).toMatchObject({
      after: [],
      driftTypes: ['json_without_reference', 'invalid_file_id'],
      proposedAction: 'REMOVE_INVALID_SNAPSHOT',
      removeFileIds: ['g1'],
      requiresManualReview: false,
    });
  });

  it('keeps invalid_file_id with an existing canonical reference in MANUAL_REVIEW', () => {
    const entry = buildEntry({
      assetStatusByFileId: statusMap([['g1', 'MISSING']]),
      referenceFileIds: ['g1'],
      snapshotValue: JSON.stringify([{ fileId: 'g1' }]),
    });
    expect(entry).toMatchObject({
      proposedAction: 'MANUAL_REVIEW',
      requiresManualReview: true,
    });
  });

  it('keeps an UNKNOWN asset (no file_assets row) in MANUAL_REVIEW', () => {
    const entry = buildEntry({
      snapshotValue: JSON.stringify([{ fileId: 'u1' }]),
    });
    expect(entry).toMatchObject({
      proposedAction: 'MANUAL_REVIEW',
      requiresManualReview: true,
    });
  });

  it('keeps reference_without_json with a dead asset in MANUAL_REVIEW', () => {
    const entry = buildEntry({
      assetStatusByFileId: statusMap([['r1', 'DELETED']]),
      referenceFileIds: ['r1'],
    });
    expect(entry).toMatchObject({
      proposedAction: 'MANUAL_REVIEW',
      requiresManualReview: true,
    });
  });

  it('combines repair, rebuild and dedupe in one deterministic entry', () => {
    const first = buildEntry({
      assetStatusByFileId: statusMap([
        ['f1', 'ACTIVE'],
        ['r1', 'ACTIVE'],
      ]),
      referenceFileIds: ['r1'],
      snapshotValue: JSON.stringify([{ fileId: 'f1' }, { fileId: 'f1' }]),
    });
    const second = buildEntry({
      assetStatusByFileId: statusMap([
        ['f1', 'ACTIVE'],
        ['r1', 'ACTIVE'],
      ]),
      referenceFileIds: ['r1'],
      snapshotValue: JSON.stringify([{ fileId: 'f1' }, { fileId: 'f1' }]),
    });
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      after: ['f1', 'r1'],
      before: ['f1', 'f1'],
      driftTypes: [
        'json_without_reference',
        'reference_without_json',
        'duplicate_json_id',
      ],
      proposedAction: 'REPAIR_REFERENCE',
    });
  });
});

describe('target snapshot building', () => {
  it('dedupes, drops removed ids and appends rebuilt references', () => {
    const target = buildTargetSnapshotItems(
      [
        { fileId: 'a' },
        { fileId: 'b' },
        { fileId: 'a' },
        { url: 'https://cdn/legacy.png' },
      ],
      { appendFileIds: ['c'], removeFileIds: new Set(['b']) },
    );
    expect(target).toEqual([
      { fileId: 'a' },
      { url: 'https://cdn/legacy.png' },
      { fileId: 'c' },
    ]);
    expect(stringifyInspectionDocumentSnapshot(target)).toBe(
      JSON.stringify([
        { fileId: 'a' },
        { url: 'https://cdn/legacy.png' },
        { fileId: 'c' },
      ]),
    );
  });
});

describe('reconcile options', () => {
  it('defaults to read-only dry-run with a bounded batch', () => {
    expect(parseInspectionDocumentReconcileOptions([])).toEqual({
      mode: 'dry-run',
      batchSize: 200,
    });
  });

  it('requires a plan file for apply', () => {
    expect(() => parseInspectionDocumentReconcileOptions(['--apply'])).toThrow(
      '--apply requires --plan-file',
    );
  });

  it('parses batch, limit, cursor and plan/report files', () => {
    expect(
      parseInspectionDocumentReconcileOptions([
        '--apply',
        '--plan-file',
        'plan.json',
        '--report-file',
        'report.json',
        '--batch-size',
        '50',
        '--limit',
        '1000',
        '--after-id',
        'cursor-1',
      ]),
    ).toEqual({
      mode: 'apply',
      batchSize: 50,
      limit: 1000,
      afterId: 'cursor-1',
      planFile: 'plan.json',
      reportFile: 'report.json',
    });
  });

  it('rejects unknown arguments and invalid batch sizes', () => {
    expect(() =>
      parseInspectionDocumentReconcileOptions(['--explode']),
    ).toThrow('unknown argument');
    expect(() =>
      parseInspectionDocumentReconcileOptions(['--batch-size', '0']),
    ).toThrow('positive integer');
  });
});

describe('scanInspectionDocumentDrift (dry-run)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scans in bounded batches and never writes', async () => {
    vi.mocked(prisma.inspections.findMany)
      .mockResolvedValueOnce([
        {
          documents: JSON.stringify([{ fileId: 'f1' }]),
          id: 'inspection-1',
          selfCheckDocuments: null,
        },
      ] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(prisma.file_references.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.file_assets.findMany).mockResolvedValue([
      { id: 'f1', status: 'ACTIVE' },
    ] as never);

    const { entries, scanned } = await scanInspectionDocumentDrift({
      mode: 'dry-run',
      batchSize: 1,
    });

    expect(scanned).toBe(1);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      inspectionId: 'inspection-1',
      proposedAction: 'REPAIR_REFERENCE',
    });
    expect(prisma.inspections.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.inspections.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1 }),
    );
    expect(prisma.inspections.updateMany).not.toHaveBeenCalled();
    expect(prisma.file_references.createMany).not.toHaveBeenCalled();
  });

  it('honors limit and resume cursor', async () => {
    vi.mocked(prisma.inspections.findMany).mockResolvedValue([] as never);
    await scanInspectionDocumentDrift({
      mode: 'dry-run',
      batchSize: 10,
      limit: 5,
      afterId: 'cursor-9',
    });
    expect(prisma.inspections.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
        where: { id: { gt: 'cursor-9' }, isDeleted: false },
      }),
    );
  });
});

describe('applyInspectionDocumentReconcileEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation((async (
      callback: (tx: unknown) => unknown,
    ) => callback(prisma)) as never);
    vi.mocked(prisma.inspections.updateMany).mockResolvedValue({
      count: 1,
    } as never);
    vi.mocked(prisma.file_references.createMany).mockResolvedValue({
      count: 1,
    } as never);
  });

  it('applies REPAIR_REFERENCE atomically and emits a rollback payload', async () => {
    const entry = buildEntry({
      assetStatusByFileId: statusMap([['f1', 'ACTIVE']]),
      snapshotValue: JSON.stringify([{ fileId: 'f1' }]),
    }) as NonNullable<ReturnType<typeof buildEntry>>;
    const result = await applyInspectionDocumentReconcileEntry({
      assetStatusByFileId: statusMap([['f1', 'ACTIVE']]),
      currentInspection: {
        documents: JSON.stringify([{ fileId: 'f1' }]),
        id: 'inspection-1',
        selfCheckDocuments: null,
      },
      db: prisma,
      entry,
      referenceFileIds: [],
      runId: 'run-1',
    });

    expect(result.status).toBe('APPLIED');
    expect(prisma.file_references.createMany).toHaveBeenCalledWith({
      data: [
        {
          bizId: 'inspection-1',
          bizType: 'inspection_record',
          fieldName: 'documents',
          fileId: 'f1',
          sortOrder: 0,
        },
      ],
      skipDuplicates: true,
    });
    expect(prisma.inspections.updateMany).toHaveBeenCalledWith({
      data: {
        documents: JSON.stringify([{ fileId: 'f1' }]),
        selfCheckDocuments: null,
      },
      where: {
        id: 'inspection-1',
        documents: JSON.stringify([{ fileId: 'f1' }]),
        selfCheckDocuments: null,
      },
    });
    expect(result.rollback).toMatchObject({
      createdReferences: [{ fileId: 'f1' }],
      runId: 'run-1',
      snapshot: {
        data: {
          documents: JSON.stringify([{ fileId: 'f1' }]),
          selfCheckDocuments: null,
        },
        where: {
          documents: JSON.stringify([{ fileId: 'f1' }]),
          selfCheckDocuments: null,
        },
      },
    });
  });

  it('rebuilds the snapshot for reference_without_json', async () => {
    const entry = buildEntry({
      assetStatusByFileId: statusMap([['r1', 'ACTIVE']]),
      referenceFileIds: ['r1'],
    }) as NonNullable<ReturnType<typeof buildEntry>>;
    const result = await applyInspectionDocumentReconcileEntry({
      assetStatusByFileId: statusMap([['r1', 'ACTIVE']]),
      currentInspection: {
        documents: null,
        id: 'inspection-1',
        selfCheckDocuments: null,
      },
      db: prisma,
      entry,
      referenceFileIds: ['r1'],
      runId: 'run-1',
    });
    expect(result.status).toBe('APPLIED');
    expect(prisma.inspections.updateMany).toHaveBeenCalledWith({
      data: {
        documents: JSON.stringify([{ fileId: 'r1' }]),
        selfCheckDocuments: null,
      },
      where: {
        id: 'inspection-1',
        documents: null,
        selfCheckDocuments: null,
      },
    });
    expect(prisma.file_references.createMany).not.toHaveBeenCalled();
  });

  it('skips on a CAS conflict without overwriting newer data', async () => {
    const entry = buildEntry({
      assetStatusByFileId: statusMap([['f1', 'ACTIVE']]),
      snapshotValue: JSON.stringify([{ fileId: 'f1' }]),
    }) as NonNullable<ReturnType<typeof buildEntry>>;
    vi.mocked(prisma.inspections.updateMany).mockResolvedValue({
      count: 0,
    } as never);
    const result = await applyInspectionDocumentReconcileEntry({
      assetStatusByFileId: statusMap([['f1', 'ACTIVE']]),
      currentInspection: {
        documents: JSON.stringify([{ fileId: 'f1' }]),
        id: 'inspection-1',
        selfCheckDocuments: null,
      },
      db: prisma,
      entry,
      referenceFileIds: [],
      runId: 'run-1',
    });
    expect(result.status).toBe('SKIPPED_CONCURRENT_CHANGE');
    expect(result.rollback).toBeNull();
  });

  it('is idempotent: a second apply after the reference exists is a no-op', async () => {
    const entry = buildEntry({
      assetStatusByFileId: statusMap([['f1', 'ACTIVE']]),
      snapshotValue: JSON.stringify([{ fileId: 'f1' }]),
    }) as NonNullable<ReturnType<typeof buildEntry>>;
    const result = await applyInspectionDocumentReconcileEntry({
      assetStatusByFileId: statusMap([['f1', 'ACTIVE']]),
      currentInspection: {
        documents: JSON.stringify([{ fileId: 'f1' }]),
        id: 'inspection-1',
        selfCheckDocuments: null,
      },
      db: prisma,
      entry,
      referenceFileIds: ['f1'],
      runId: 'run-1',
    });
    expect(result.status).toBe('ALREADY_CONSISTENT');
    expect(prisma.inspections.updateMany).not.toHaveBeenCalled();
    expect(prisma.file_references.createMany).not.toHaveBeenCalled();
  });

  it('never writes a MANUAL_REVIEW entry', async () => {
    const entry = buildEntry({
      snapshotValue: JSON.stringify([{ fileId: 'u1' }]),
    }) as NonNullable<ReturnType<typeof buildEntry>>;
    expect(entry.requiresManualReview).toBe(true);
    const result = await applyInspectionDocumentReconcileEntry({
      assetStatusByFileId: new Map(),
      currentInspection: {
        documents: JSON.stringify([{ fileId: 'u1' }]),
        id: 'inspection-1',
        selfCheckDocuments: null,
      },
      db: prisma,
      entry,
      referenceFileIds: [],
      runId: 'run-1',
    });
    expect(result.status).toBe('MANUAL_REVIEW_REQUIRED');
    expect(prisma.inspections.updateMany).not.toHaveBeenCalled();
    expect(prisma.file_references.createMany).not.toHaveBeenCalled();
  });
});

describe('plan file round-trip', () => {
  it('writes and reloads a versioned plan', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'qms-reconcile-'));
    const filePath = path.join(dir, 'plan.json');
    const plan: InspectionDocumentReconcilePlan = {
      version: 1 as const,
      generatedAt: '2026-08-20T00:00:00.000Z',
      entries: [
        {
          inspectionId: 'inspection-1',
          fieldName: 'documents' as const,
          driftTypes: ['duplicate_json_id'],
          proposedAction: 'DEDUPE_SNAPSHOT' as const,
          requiresManualReview: false,
          confidence: 'HIGH' as const,
          reason: 'duplicate_json_id(1)',
          before: ['d1', 'd1'],
          after: ['d1'],
          removeFileIds: [],
          appendFileIds: [],
          repairReferences: [],
          rollback: { documents: null, selfCheckDocuments: null },
        },
      ],
    };
    writeReconcilePlanFile(filePath, plan);
    expect(loadReconcilePlanFile(filePath)).toEqual(plan);
  });

  it('rejects malformed plan files', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'qms-reconcile-'));
    const filePath = path.join(dir, 'plan.json');
    writeFileSync(
      filePath,
      JSON.stringify({ version: 2, entries: [] }),
      'utf8',
    );
    expect(() => loadReconcilePlanFile(filePath)).toThrow(
      'expected { version: 1, entries: [] }',
    );
  });
});
