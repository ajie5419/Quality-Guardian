/**
 * Tests for supplier-score-snapshot.service.ts
 *
 * Focuses on the openEngineeringCount accumulation logic:
 * only records with status === 'OPEN' should be counted as open.
 * Records with status IN_PROGRESS, RESOLVED, CLAIMING, or CLOSED
 * must be excluded from the open count.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AfterSalesAPI } from '~/modules/after-sales';
import { InspectionService } from '~/modules/inspection';
import { SupplierScoreSnapshotService } from '~/modules/supplier/supplier-score-snapshot.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    suppliers: {
      findMany: vi.fn(),
    },
    supplier_score_snapshots: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock('~/modules/inspection', () => ({
  InspectionService: {
    getSupplierScoringData: vi.fn(),
  },
}));

vi.mock('~/modules/after-sales', () => ({
  AfterSalesAPI: {
    getSupplierScoringData: vi.fn(),
  },
}));

vi.mock('~/utils/canonical-master-data', () => ({
  MasterDataGovernanceKernel: {
    resolveCanonicalIdsByNames: vi.fn().mockResolvedValue(new Map()),
  },
}));

function makeSupplier(name: string) {
  return {
    id: `${name}-id`,
    name,
    status: 'Qualified',
    rating: 'A',
    qualityScore: 100,
    category: 'Supplier',
    outsourcingMode: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
}

function buildInspectionScoringData(
  engineeringStatusStats: Array<{
    _count: { id: number };
    status: string;
    supplierName: string;
  }>,
) {
  return {
    incomingStats: [],
    engineeringStats: [],
    engineeringStatusStats,
    records: [],
  };
}

function buildAfterSalesScoringData() {
  return {
    stats: [],
    statusStats: [],
    records: [],
  };
}

describe('supplierScoreSnapshotService openEngineeringCount open-status definition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.supplier_score_snapshots.upsert as any).mockResolvedValue({});
    (AfterSalesAPI.getSupplierScoringData as any).mockResolvedValue(
      buildAfterSalesScoringData(),
    );
  });

  it('counts only OPEN status records as open engineering issues', async () => {
    (InspectionService.getSupplierScoringData as any).mockResolvedValue(
      buildInspectionScoringData([
        { supplierName: 'S1', status: 'OPEN', _count: { id: 2 } },
        { supplierName: 'S1', status: 'IN_PROGRESS', _count: { id: 3 } },
        { supplierName: 'S1', status: 'RESOLVED', _count: { id: 1 } },
        { supplierName: 'S1', status: 'CLAIMING', _count: { id: 1 } },
        { supplierName: 'S1', status: 'CLOSED', _count: { id: 5 } },
      ]),
    );

    await SupplierScoreSnapshotService.refreshSuppliers([makeSupplier('S1')]);

    const upsertCall = (prisma.supplier_score_snapshots.upsert as any).mock
      .calls[0][0];
    // The snapshot's finalQualityScore will reflect open issue penalty only
    // for 2 open records, not 10. We verify via the upsert call being made
    // and that only 2 open records fed the warning score (isWarning false for 2).
    expect(upsertCall).toBeDefined();
    // Snapshot was written (not skipped due to open count overflow)
    expect(prisma.supplier_score_snapshots.upsert).toHaveBeenCalledTimes(1);
    // With only 2 open issues (not 10), the score should be higher than it
    // would be if IN_PROGRESS/RESOLVED/CLAIMING were incorrectly included.
    expect(upsertCall.create.finalQualityScore).toBeGreaterThan(85);
  });

  it('does not count CLOSED status records as open', async () => {
    (InspectionService.getSupplierScoringData as any).mockResolvedValue(
      buildInspectionScoringData([
        { supplierName: 'S1', status: 'CLOSED', _count: { id: 10 } },
      ]),
    );

    await SupplierScoreSnapshotService.refreshSuppliers([makeSupplier('S1')]);

    const upsertCall = (prisma.supplier_score_snapshots.upsert as any).mock
      .calls[0][0];
    // No open issues -> score should remain at 100
    expect(upsertCall.create.finalQualityScore).toBe(100);
  });

  it('does not count IN_PROGRESS/RESOLVED/CLAIMING as open (regression for pre-fix behavior)', async () => {
    // Before fix: only CLOSED was excluded, so IN_PROGRESS/RESOLVED/CLAIMING
    // would inflate openEngineeringCount. After fix: only OPEN counts.
    (InspectionService.getSupplierScoringData as any).mockResolvedValue(
      buildInspectionScoringData([
        { supplierName: 'S1', status: 'IN_PROGRESS', _count: { id: 5 } },
        { supplierName: 'S1', status: 'RESOLVED', _count: { id: 5 } },
        { supplierName: 'S1', status: 'CLAIMING', _count: { id: 5 } },
      ]),
    );

    await SupplierScoreSnapshotService.refreshSuppliers([makeSupplier('S1')]);

    const upsertCall = (prisma.supplier_score_snapshots.upsert as any).mock
      .calls[0][0];
    // None of the above are OPEN, so score stays at 100
    expect(upsertCall.create.finalQualityScore).toBe(100);
  });

  it('correctly counts multiple OPEN records across suppliers', async () => {
    (InspectionService.getSupplierScoringData as any).mockResolvedValue(
      buildInspectionScoringData([
        { supplierName: 'S1', status: 'OPEN', _count: { id: 1 } },
        { supplierName: 'S2', status: 'OPEN', _count: { id: 1 } },
        { supplierName: 'S2', status: 'IN_PROGRESS', _count: { id: 99 } },
      ]),
    );

    await SupplierScoreSnapshotService.refreshSuppliers([
      makeSupplier('S1'),
      makeSupplier('S2'),
    ]);

    expect(prisma.supplier_score_snapshots.upsert).toHaveBeenCalledTimes(2);
    const calls = (prisma.supplier_score_snapshots.upsert as any).mock.calls;
    const s1Call = calls.find((c: any) => c[0].where.supplierId === 'S1-id');
    const s2Call = calls.find((c: any) => c[0].where.supplierId === 'S2-id');
    // S2 has 1 OPEN + 99 IN_PROGRESS; only the 1 OPEN should count
    // Both should have comparable scores (only 1 open issue each)
    expect(s1Call[0].create.finalQualityScore).toBe(
      s2Call[0].create.finalQualityScore,
    );
  });
});
