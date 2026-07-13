import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileStorageService } from '~/modules/file-storage';
import { InspectionService } from '~/modules/inspection';
import { SupplierScoreSnapshotService } from '~/modules/supplier/supplier-score-snapshot.service';
import {
  applyRecordsToStats,
  classifyDefect,
  createEmptyStats,
  scoreSupplierListItem,
} from '~/modules/supplier/supplier-scoring';
import { SupplierService } from '~/modules/supplier/supplier.service';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    suppliers: {
      aggregate: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    supplier_score_snapshots: {
      aggregate: vi.fn(),
      upsert: vi.fn(),
    },
    inspections: {
      groupBy: vi.fn(),
    },
    after_sales: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    quality_records: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

vi.mock('~/modules/file-storage', () => ({
  FileStorageService: {
    registerReferencesFromAttachments: vi.fn(),
  },
}));

vi.mock('~/modules/inspection', () => ({
  InspectionService: {
    findSupplierHistory: vi.fn(),
    getSupplierHistoryProjects: vi.fn(),
    getSupplierScoringData: vi.fn(),
  },
}));

vi.mock('~/utils/canonical-master-data', () => ({
  MasterDataGovernanceKernel: {
    resolveCanonicalIdForWrite: vi.fn().mockResolvedValue(undefined),
    resolveCanonicalNameById: vi.fn().mockResolvedValue(undefined),
    resolveCanonicalIdsByNames: vi.fn().mockResolvedValue(new Map()),
  },
}));

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));
vi.mock('~/utils/logger', () => ({
  createModuleLogger: () => mockLogger,
}));

vi.mock('~/utils/governed-write', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('~/utils/governed-write')>();
  return {
    ...actual,
    buildGovernedCanonicalWritePairForTable: vi.fn().mockResolvedValue({}),
  };
});
function supplier(name: string, status = 'Qualified') {
  const now = new Date('2026-02-14T00:00:00.000Z');
  return {
    id: `${name}-id`,
    name,
    status,
    rating: 'A',
    qualityScore: 100,
    createdAt: now,
    updatedAt: now,
  };
}

function buildStatsMap(input: {
  afterSalesStats: any[];
  afterSalesStatusStats: any[];
  engineeringStats: any[];
  engineeringStatusStats: any[];
  incomingStats: any[];
  recentAfterSales: any[];
  recentQualityRecords: any[];
}) {
  const statsMap = new Map<string, ReturnType<typeof createEmptyStats>>();
  input.incomingStats.forEach((s) => {
    const current = statsMap.get(s.supplierName) || createEmptyStats();
    current.count += s._count.id;
    current.quantity += s._sum.quantity || 0;
    if (s.result === 'PASS') current.qualifiedCount += s._count.id;
    if (s.result === 'FAIL') {
      current.failures += s._count.id;
      current.failuresQuantity += s._sum.quantity || 0;
    }
    statsMap.set(s.supplierName, current);
  });
  input.afterSalesStats.forEach((s) => {
    const current = statsMap.get(s.supplierBrand) || createEmptyStats();
    current.afterSalesLoss +=
      Number(s._sum.materialCost || 0) + Number(s._sum.laborTravelCost || 0);
    current.afterSalesCount += s._count.id;
    statsMap.set(s.supplierBrand, current);
  });
  input.engineeringStats.forEach((s) => {
    const current = statsMap.get(s.supplierName) || createEmptyStats();
    current.engineeringLoss += Number(s._sum.lossAmount || 0);
    current.engineeringCount += s._count.id;
    current.engineeringDefectQuantity += s._sum.quantity || 0;
    statsMap.set(s.supplierName, current);
  });
  input.engineeringStatusStats.forEach((s) => {
    if (s.status !== 'OPEN') return;
    const current = statsMap.get(s.supplierName) || createEmptyStats();
    current.openEngineeringCount += s._count.id;
    statsMap.set(s.supplierName, current);
  });
  input.afterSalesStatusStats.forEach((s) => {
    if (
      ['CANCELLED', 'CLOSED', 'COMPLETED', 'RESOLVED'].includes(s.claimStatus)
    ) {
      return;
    }
    const current = statsMap.get(s.supplierBrand) || createEmptyStats();
    current.openAfterSalesCount += s._count.id;
    statsMap.set(s.supplierBrand, current);
  });

  const recordMap = new Map<string, any[]>();
  [
    ...input.recentQualityRecords.map((record) => ({
      ...record,
      origin: 'qualityRecords',
    })),
    ...input.recentAfterSales.map((record) => ({
      ...record,
      origin: 'afterSales',
    })),
  ].forEach((record) => {
    const name =
      record.origin === 'afterSales'
        ? record.supplierBrand
        : record.supplierName;
    const loss =
      record.origin === 'afterSales'
        ? Number(record.materialCost || 0) + Number(record.laborTravelCost || 0)
        : Number(record.lossAmount || 0);
    const records = recordMap.get(name) || [];
    records.push({
      date:
        record.origin === 'afterSales'
          ? new Date(record.occurDate)
          : new Date(record.date),
      loss,
      origin: record.origin,
      type: classifyDefect(loss, record.severity || undefined),
    });
    recordMap.set(name, records);
  });
  recordMap.forEach((records, name) => {
    const current = statsMap.get(name) || createEmptyStats();
    records.sort((a, b) => b.date.getTime() - a.date.getTime());
    statsMap.set(name, applyRecordsToStats(current, records));
  });
  return statsMap;
}

function buildScoreSnapshot(item: any, stat = createEmptyStats()) {
  const scored = scoreSupplierListItem(item, stat);
  return {
    afterSalesIssueCount: scored.afterSalesIssueCount,
    afterSalesScore: scored.afterSalesScore,
    engineeringIssueCount: scored.engineeringIssueCount,
    engineeringScore: scored.engineeringScore,
    finalQualityScore: scored.qualityScore,
    finalRating: scored.level,
    finalStatus: scored.status,
    incomingBatchCount: scored.incomingBatchCount,
    incomingQualifiedRate: scored.incomingQualifiedRate,
    incomingScore: scored.incomingScore,
    incomingTotalQuantity: scored.incomingTotalQuantity,
    isWarning: scored.isWarning,
    outsourcingMode: scored.outsourcingMode,
    scoringModel: scored.scoringModel,
    stabilityScore: scored.stabilityScore,
    totalAfterSalesLoss: scored.totalAfterSalesLoss,
    totalEngineeringLoss: scored.totalEngineeringLoss,
    warningReasons: scored.warningReasons,
  };
}

function setupScenario(input: {
  afterSalesStats?: any[];
  afterSalesStatusStats?: any[];
  engineeringStats?: any[];
  engineeringStatusStats?: any[];
  incomingStats?: any[];
  recentAfterSales?: any[];
  recentQualityRecords?: any[];
  suppliers?: any[];
}) {
  const {
    suppliers = [supplier('S1')],
    incomingStats = [],
    afterSalesStats = [],
    engineeringStats = [],
    engineeringStatusStats = [],
    afterSalesStatusStats = [],
    recentAfterSales = [],
    recentQualityRecords = [],
  } = input;
  const statsMap = buildStatsMap({
    afterSalesStats,
    afterSalesStatusStats,
    engineeringStats,
    engineeringStatusStats,
    incomingStats,
    recentAfterSales,
    recentQualityRecords,
  });
  const supplierRows = suppliers.map((item) => ({
    ...item,
    scoreSnapshot:
      item.scoreSnapshot || buildScoreSnapshot(item, statsMap.get(item.name)),
  }));

  (prisma.suppliers.findMany as any).mockResolvedValue(supplierRows);
  (prisma.suppliers.count as any).mockResolvedValue(supplierRows.length);
  (prisma.suppliers.aggregate as any).mockResolvedValue({
    _avg: {
      qualityScore:
        supplierRows.reduce(
          (sum, item) => sum + Number(item.qualityScore || 0),
          0,
        ) / (supplierRows.length || 1),
    },
  });
  (prisma.supplier_score_snapshots.aggregate as any).mockResolvedValue({
    _avg: {
      finalQualityScore:
        supplierRows.reduce(
          (sum, item) =>
            sum +
            Number(
              item.scoreSnapshot?.finalQualityScore ?? item.qualityScore ?? 0,
            ),
          0,
        ) / (supplierRows.length || 1),
    },
  });
  (prisma.supplier_score_snapshots.upsert as any).mockResolvedValue({});
  (prisma.inspections.groupBy as any).mockResolvedValue(incomingStats);
  (prisma.after_sales.groupBy as any)
    .mockResolvedValueOnce(afterSalesStats)
    .mockResolvedValueOnce(afterSalesStatusStats);
  (prisma.quality_records.groupBy as any)
    .mockResolvedValueOnce(engineeringStats)
    .mockResolvedValueOnce(engineeringStatusStats);
  (prisma.after_sales.findMany as any).mockResolvedValue(recentAfterSales);
  (prisma.quality_records.findMany as any).mockResolvedValue(
    recentQualityRecords,
  );
}

async function scoreOf(name = 'S1') {
  const result = await SupplierService.findAll({ category: 'Supplier' });
  return (result.items as any[]).find((item) => item.name === name);
}

describe('supplierService standard scoring samples', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sample 01: clean supplier should be 100 / Qualified / A', async () => {
    setupScenario({});
    const row = await scoreOf();

    expect(row.qualityScore).toBe(100);
    expect(row.status).toBe('Qualified');
    expect(row.level).toBe('A');
    expect(row.incomingScore).toBe(100);
    expect(row.engineeringScore).toBe(100);
    expect(row.afterSalesScore).toBe(100);
    expect(row.stabilityScore).toBe(100);
  });

  it('sample 02: poor incoming should become Observation with capped score', async () => {
    setupScenario({
      incomingStats: [
        {
          supplierName: 'S1',
          result: 'PASS',
          _count: { id: 7 },
          _sum: { quantity: 7 },
        },
        {
          supplierName: 'S1',
          result: 'FAIL',
          _count: { id: 3 },
          _sum: { quantity: 3 },
        },
      ],
    });
    const row = await scoreOf();

    expect(row.incomingScore).toBe(91);
    expect(row.status).toBe('Observation');
    expect(row.qualityScore).toBe(70);
    expect(row.level).toBe('C');
  });

  it('sample 03: one minor low-loss engineering issue should stay high score', async () => {
    setupScenario({
      engineeringStats: [
        {
          supplierName: 'S1',
          _count: { id: 1 },
          _sum: { lossAmount: 1000, quantity: 1 },
        },
      ],
      recentQualityRecords: [
        {
          supplierName: 'S1',
          lossAmount: 1000,
          severity: 'minor',
          date: new Date('2026-02-01'),
        },
      ],
    });
    const row = await scoreOf();

    expect(row.engineeringIssueCount).toBe(1);
    expect(row.engineeringScore).toBeGreaterThanOrEqual(90);
    expect(row.qualityScore).toBeGreaterThanOrEqual(95);
    expect(row.status).toBe('Qualified');
  });

  it('sample 04: one engineering issue with high loss should reduce score明显', async () => {
    setupScenario({
      engineeringStats: [
        {
          supplierName: 'S1',
          _count: { id: 1 },
          _sum: { lossAmount: 20_000, quantity: 1 },
        },
      ],
      recentQualityRecords: [
        {
          supplierName: 'S1',
          lossAmount: 20_000,
          severity: 'minor',
          date: new Date('2026-02-01'),
        },
      ],
    });
    const row = await scoreOf();

    expect(row.engineeringScore).toBe(85);
    expect(row.qualityScore).toBeLessThanOrEqual(85);
    expect(['B', 'C']).toContain(row.level);
  });

  it('sample 05: one after-sales issue with high loss should reduce score明显', async () => {
    setupScenario({
      afterSalesStats: [
        {
          supplierBrand: 'S1',
          _count: { id: 1 },
          _sum: { laborTravelCost: 5000, materialCost: 15_000 },
        },
      ],
      recentAfterSales: [
        {
          supplierBrand: 'S1',
          materialCost: 15_000,
          laborTravelCost: 5000,
          severity: 'minor',
          occurDate: new Date('2026-02-01'),
        },
      ],
    });
    const row = await scoreOf();

    expect(row.afterSalesIssueCount).toBe(1);
    expect(row.afterSalesScore).toBe(85);
    expect(row.qualityScore).toBeLessThanOrEqual(85);
  });

  it('sample 06: should freeze when max single loss exceeds threshold with enough samples', async () => {
    setupScenario({
      engineeringStats: [
        {
          supplierName: 'S1',
          _count: { id: 3 },
          _sum: { lossAmount: 91_000, quantity: 3 },
        },
      ],
      recentQualityRecords: [
        {
          supplierName: 'S1',
          lossAmount: 90_000,
          severity: 'minor',
          date: new Date('2026-02-03'),
        },
        {
          supplierName: 'S1',
          lossAmount: 500,
          severity: 'minor',
          date: new Date('2026-02-02'),
        },
        {
          supplierName: 'S1',
          lossAmount: 500,
          severity: 'minor',
          date: new Date('2026-02-01'),
        },
      ],
    });
    const row = await scoreOf();

    expect(row.engineeringIssueCount).toBe(3);
    expect(row.status).toBe('Frozen');
    expect(row.qualityScore).toBe(0);
    expect(row.level).toBe('D');
  });

  it('sample 07: should freeze on 3 consecutive A/B issues with enough samples', async () => {
    setupScenario({
      engineeringStats: [
        {
          supplierName: 'S1',
          _count: { id: 3 },
          _sum: { lossAmount: 3000, quantity: 3 },
        },
      ],
      recentQualityRecords: [
        {
          supplierName: 'S1',
          lossAmount: 1000,
          severity: 'major',
          date: new Date('2026-02-03'),
        },
        {
          supplierName: 'S1',
          lossAmount: 1000,
          severity: 'major',
          date: new Date('2026-02-02'),
        },
        {
          supplierName: 'S1',
          lossAmount: 1000,
          severity: 'major',
          date: new Date('2026-02-01'),
        },
      ],
    });
    const row = await scoreOf();

    expect(row.status).toBe('Frozen');
    expect(row.qualityScore).toBe(0);
  });

  it('sample 08: low total score should become Observation', async () => {
    setupScenario({
      engineeringStats: [
        {
          supplierName: 'S1',
          _count: { id: 1 },
          _sum: { lossAmount: 20_000, quantity: 1 },
        },
      ],
      afterSalesStats: [
        {
          supplierBrand: 'S1',
          _count: { id: 1 },
          _sum: { laborTravelCost: 5000, materialCost: 15_000 },
        },
      ],
      recentQualityRecords: [
        {
          supplierName: 'S1',
          lossAmount: 20_000,
          severity: 'minor',
          date: new Date('2026-02-02'),
        },
      ],
      recentAfterSales: [
        {
          supplierBrand: 'S1',
          materialCost: 15_000,
          laborTravelCost: 5000,
          severity: 'minor',
          occurDate: new Date('2026-02-01'),
        },
      ],
    });
    const row = await scoreOf();

    expect(row.status).toBe('Observation');
    expect(row.qualityScore).toBeLessThanOrEqual(75);
  });

  it('sample 09: strict ratio rules should not trigger on small sample (<3)', async () => {
    setupScenario({
      engineeringStats: [
        {
          supplierName: 'S1',
          _count: { id: 1 },
          _sum: { lossAmount: 100, quantity: 1 },
        },
      ],
      afterSalesStats: [
        {
          supplierBrand: 'S1',
          _count: { id: 1 },
          _sum: { laborTravelCost: 50, materialCost: 50 },
        },
      ],
      engineeringStatusStats: [
        { supplierName: 'S1', status: 'OPEN', _count: { id: 1 } },
      ],
      afterSalesStatusStats: [
        { supplierBrand: 'S1', claimStatus: 'OPEN', _count: { id: 1 } },
      ],
      recentQualityRecords: [
        {
          supplierName: 'S1',
          lossAmount: 100,
          severity: 'major',
          date: new Date('2026-02-02'),
        },
      ],
      recentAfterSales: [
        {
          supplierBrand: 'S1',
          materialCost: 50,
          laborTravelCost: 50,
          severity: 'major',
          occurDate: new Date('2026-02-01'),
        },
      ],
    });
    const row = await scoreOf();

    expect(row.engineeringIssueCount + row.afterSalesIssueCount).toBe(2);
    expect(row.status).toBe('Qualified');
    expect(row.qualityScore).toBeGreaterThanOrEqual(80);
  });

  it('sample 10: sorting by qualityScore desc should use database ordering', async () => {
    setupScenario({
      suppliers: [
        { ...supplier('S1'), qualityScore: 100 },
        { ...supplier('S2'), qualityScore: 80 },
        { ...supplier('S3'), qualityScore: 90 },
      ],
      engineeringStats: [
        {
          supplierName: 'S2',
          _count: { id: 1 },
          _sum: { lossAmount: 20_000, quantity: 1 },
        },
        {
          supplierName: 'S3',
          _count: { id: 1 },
          _sum: { lossAmount: 5000, quantity: 1 },
        },
      ],
      recentQualityRecords: [
        {
          supplierName: 'S2',
          lossAmount: 20_000,
          severity: 'minor',
          date: new Date('2026-02-02'),
        },
        {
          supplierName: 'S3',
          lossAmount: 5000,
          severity: 'minor',
          date: new Date('2026-02-01'),
        },
      ],
    });

    const result = await SupplierService.findAll({
      category: 'Supplier',
      sortBy: 'qualityScore',
      sortOrder: 'desc',
    });
    const names = result.items.map((item: any) => item.name);
    expect(names).toEqual(['S1', 'S2', 'S3']);
    expect(prisma.suppliers.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { scoreSnapshot: true },
        orderBy: [
          { scoreSnapshot: { finalQualityScore: 'desc' } },
          { createdAt: 'desc' },
        ],
        skip: 0,
        take: 20,
      }),
    );
  });

  it('refreshMissing should only load suppliers without score snapshots', async () => {
    const missingSuppliers = [supplier('Missing A'), supplier('Missing B')];
    (prisma.suppliers.findMany as any)
      .mockResolvedValueOnce(missingSuppliers)
      .mockResolvedValueOnce([]);
    (InspectionService.getSupplierScoringData as any).mockResolvedValue({
      engineeringStats: [],
      engineeringStatusStats: [],
      incomingStats: [],
      records: [],
    });
    (prisma.after_sales.groupBy as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (prisma.after_sales.findMany as any).mockResolvedValue([]);
    (prisma.supplier_score_snapshots.upsert as any).mockResolvedValue({});

    const result = await SupplierScoreSnapshotService.refreshMissing();

    expect(result).toEqual({ batches: 1, processed: 2 });
    expect(prisma.suppliers.findMany).toHaveBeenNthCalledWith(1, {
      orderBy: { id: 'asc' },
      take: 50,
      where: {
        isDeleted: false,
        OR: [
          { scoreSnapshot: { is: null } },
          {
            scoreSnapshot: {
              is: {
                scoringModel: {
                  notIn: ['IN_HOUSE_OUTSOURCING_V2', 'SUPPLIER_V2'],
                },
              },
            },
          },
        ],
      },
    });
    expect(prisma.supplier_score_snapshots.upsert).toHaveBeenCalledTimes(2);
  });

  it('sample 11: external outsourcing should use supplier risk rules', async () => {
    setupScenario({
      suppliers: [
        {
          ...supplier('OS1'),
          category: 'Outsourcing',
          outsourcingMode: 'EXTERNAL_PROCESSOR',
        },
      ],
      engineeringStats: [
        {
          supplierName: 'OS1',
          _count: { id: 3 },
          _sum: { lossAmount: 91_000, quantity: 3 },
        },
      ],
      recentQualityRecords: [
        {
          supplierName: 'OS1',
          lossAmount: 90_000,
          severity: 'minor',
          date: new Date('2026-02-03'),
        },
        {
          supplierName: 'OS1',
          lossAmount: 500,
          severity: 'minor',
          date: new Date('2026-02-02'),
        },
        {
          supplierName: 'OS1',
          lossAmount: 500,
          severity: 'minor',
          date: new Date('2026-02-01'),
        },
      ],
    });

    const result = await SupplierService.findAll({ category: 'Outsourcing' });
    const row = (result.items as any[]).find((item) => item.name === 'OS1');

    expect(row.status).toBe('Frozen');
    expect(row.qualityScore).toBe(0);
    expect(row.level).toBe('D');
  });

  it('sample 12: in-house outsourcing should treat closed minor issues as improvement items', async () => {
    setupScenario({
      suppliers: [
        {
          ...supplier('OS1'),
          category: 'Outsourcing',
          outsourcingMode: 'IN_HOUSE_TEAM',
        },
      ],
      engineeringStats: [
        {
          supplierName: 'OS1',
          _count: { id: 10 },
          _sum: { lossAmount: 1000, quantity: 10 },
        },
      ],
      recentQualityRecords: Array.from({ length: 10 }, (_, index) => ({
        supplierName: 'OS1',
        lossAmount: 100,
        severity: 'minor',
        date: new Date(`2026-02-${String(index + 1).padStart(2, '0')}`),
      })),
    });

    const result = await SupplierService.findAll({ category: 'Outsourcing' });
    const row = (result.items as any[]).find((item) => item.name === 'OS1');

    expect(row.status).toBe('Qualified');
    expect(row.qualityScore).toBe(95);
    expect(row.level).toBe('A');
    expect(row.scoringModel).toBe('IN_HOUSE_OUTSOURCING');
  });

  it('sample 13: in-house outsourcing should focus on open issue closure', async () => {
    setupScenario({
      suppliers: [
        {
          ...supplier('OS1'),
          category: 'Outsourcing',
          outsourcingMode: 'IN_HOUSE_TEAM',
        },
      ],
      engineeringStats: [
        {
          supplierName: 'OS1',
          _count: { id: 3 },
          _sum: { lossAmount: 300, quantity: 3 },
        },
      ],
      engineeringStatusStats: [
        { supplierName: 'OS1', status: 'OPEN', _count: { id: 3 } },
      ],
      recentQualityRecords: Array.from({ length: 3 }, (_, index) => ({
        supplierName: 'OS1',
        lossAmount: 100,
        severity: 'minor',
        date: new Date(`2026-02-0${index + 1}`),
      })),
    });

    const result = await SupplierService.findAll({ category: 'Outsourcing' });
    const row = (result.items as any[]).find((item) => item.name === 'OS1');

    expect(row.status).toBe('Observation');
    expect(row.qualityScore).toBe(85);
    expect(row.level).toBe('B');
  });

  it('sample 14: outsourcing without management type should default to external processor rules', async () => {
    setupScenario({
      suppliers: [
        {
          ...supplier('OS1'),
          category: 'Outsourcing',
        },
      ],
      engineeringStats: [
        {
          supplierName: 'OS1',
          _count: { id: 3 },
          _sum: { lossAmount: 91_000, quantity: 3 },
        },
      ],
      recentQualityRecords: [
        {
          supplierName: 'OS1',
          lossAmount: 90_000,
          severity: 'minor',
          date: new Date('2026-02-03'),
        },
        {
          supplierName: 'OS1',
          lossAmount: 500,
          severity: 'minor',
          date: new Date('2026-02-02'),
        },
        {
          supplierName: 'OS1',
          lossAmount: 500,
          severity: 'minor',
          date: new Date('2026-02-01'),
        },
      ],
    });

    const result = await SupplierService.findAll({ category: 'Outsourcing' });
    const row = (result.items as any[]).find((item) => item.name === 'OS1');

    expect(row.outsourcingMode).toBe('EXTERNAL_PROCESSOR');
    expect(row.scoringModel).toBe('SUPPLIER');
    expect(row.status).toBe('Frozen');
    expect(row.qualityScore).toBe(0);
  });
});

describe('supplierService admission fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(
      SupplierScoreSnapshotService,
      'refreshSuppliers',
    ).mockResolvedValue(undefined);
  });

  it('stores admission metadata and registers uploaded admission documents on create', async () => {
    const created = supplier('Supplier A');
    (prisma.suppliers.create as any).mockResolvedValue(created);
    const admissionDocuments = [{ fileId: 'file-1', name: 'admission.pdf' }];

    await SupplierService.createSupplier({
      name: 'Supplier A',
      recognizedAt: '2026-06-01',
      manufacturerNature: 'Manufacturer',
      admissionDocuments,
    });

    expect(prisma.suppliers.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Supplier A',
        recognizedAt: new Date('2026-06-01'),
        manufacturerNature: 'Manufacturer',
        admissionDocuments: JSON.stringify(admissionDocuments),
      }),
    });
    expect(
      FileStorageService.registerReferencesFromAttachments,
    ).toHaveBeenCalledWith({
      attachments: admissionDocuments,
      bizId: created.id,
      bizType: 'supplier',
      fieldName: 'admissionDocuments',
    });
  });

  it('updates admission metadata and refreshes admission document references', async () => {
    const updated = supplier('Supplier A');
    (prisma.suppliers.update as any).mockResolvedValue(updated);
    const admissionDocuments = [{ fileId: 'file-2', name: 'renewal.pdf' }];

    await SupplierService.updateSupplier(updated.id, {
      recognizedAt: '2026-06-02T00:00:00.000Z',
      admissionDocuments,
    });

    expect(prisma.suppliers.update).toHaveBeenCalledWith({
      where: { id: updated.id },
      data: expect.objectContaining({
        recognizedAt: new Date('2026-06-02T00:00:00.000Z'),
        admissionDocuments: JSON.stringify(admissionDocuments),
      }),
    });
    expect(
      FileStorageService.registerReferencesFromAttachments,
    ).toHaveBeenCalledWith({
      attachments: admissionDocuments,
      bizId: updated.id,
      bizType: 'supplier',
      fieldName: 'admissionDocuments',
    });
  });

  it('loads supplier history projects from inspection requests through inspection service', async () => {
    (prisma.suppliers.findFirst as any).mockResolvedValue({
      id: 'supplier-1',
      name: 'Supplier A',
      nameId: 'md-1',
    });
    (InspectionService.getSupplierHistoryProjects as any).mockResolvedValue([
      { workOrderNumber: 'WO-1', projectName: 'Project A' },
    ]);

    const result = await SupplierService.getHistoryProjects('supplier-1');

    expect(result).toEqual([
      { workOrderNumber: 'WO-1', projectName: 'Project A' },
    ]);
    expect(InspectionService.getSupplierHistoryProjects).toHaveBeenCalledWith({
      supplierName: 'Supplier A',
    });
  });

  it('loads in-house outsourcing history from process team records', async () => {
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalIdsByNames,
    ).mockResolvedValue(new Map([['Resident Team', 'team-1']]));
    (prisma.suppliers.findFirst as any).mockResolvedValue({
      category: 'Outsourcing',
      id: 'supplier-1',
      name: 'Resident Team',
      outsourcingMode: 'IN_HOUSE_TEAM',
    });
    (InspectionService.findSupplierHistory as any).mockResolvedValue({
      items: [{ id: 'inspection-1', partName: 'Beam' }],
      total: 1,
    });

    const result = await SupplierService.getInspectionHistory('supplier-1', {
      page: 2,
      pageSize: 5,
    });

    expect(InspectionService.findSupplierHistory).toHaveBeenCalledWith({
      category: 'PROCESS',
      identitySource: 'team',
      page: 2,
      pageSize: 5,
      supplierId: 'supplier-1',
      supplierName: 'Resident Team',
      teamNameId: 'team-1',
    });
    expect(result).toEqual({
      items: [{ id: 'inspection-1', partName: 'Beam' }],
      source: 'PROCESS',
      total: 1,
    });
  });
});

describe('supplierService silent-catch fix: batchUpsertSuppliers and importSuppliers log errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks so unrelated paths don't blow up
    (prisma.suppliers.upsert as any).mockResolvedValue({
      id: 'ok',
      name: 'S1',
    });
    (prisma.supplier_score_snapshots.upsert as any).mockResolvedValue({});
    (prisma.inspections.groupBy as any).mockResolvedValue([]);
    (prisma.after_sales.groupBy as any).mockResolvedValue([]);
    (prisma.quality_records.groupBy as any).mockResolvedValue([]);
    (prisma.after_sales.findMany as any).mockResolvedValue([]);
    (prisma.quality_records.findMany as any).mockResolvedValue([]);
  });

  it('batchUpsertSuppliers: logs error and increments errors counter on row failure', async () => {
    const boom = new Error('db constraint violation');
    (prisma.suppliers.upsert as any).mockRejectedValue(boom);

    const item = { name: 'S1', code: 'C1', category: 'Supplier' };
    const result = await SupplierService.batchUpsertSuppliers([item]);

    expect(result.errors).toBe(1);
    expect(result.success).toBe(0);
    expect(mockLogger.error).toHaveBeenCalledWith(
      boom,
      'batchUpsertSuppliers: failed to upsert row',
    );
  });

  it('batchUpsertSuppliers: continues processing remaining rows after a failure', async () => {
    const boom = new Error('fail first');
    (prisma.suppliers.upsert as any)
      .mockRejectedValueOnce(boom)
      .mockResolvedValue({ id: 'ok', name: 'S2' });

    const items = [
      { name: 'S1', code: 'C1', category: 'Supplier' },
      { name: 'S2', code: 'C2', category: 'Supplier' },
    ];
    const result = await SupplierService.batchUpsertSuppliers(items);

    expect(result.errors).toBe(1);
    expect(result.success).toBe(1);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
  });

  it('importSuppliers: logs error and keeps going on row failure', async () => {
    const boom = new Error('upsert row boom');
    (prisma.suppliers.upsert as any)
      .mockRejectedValueOnce(boom)
      .mockResolvedValue({ id: 'ok', name: 'S2' });

    const items = [
      { name: 'S1', code: 'C1', category: 'Supplier' },
      { name: 'S2', code: 'C2', category: 'Supplier' },
    ];
    const result = await SupplierService.importSuppliers(items, 'Supplier');

    expect(result.successCount).toBe(1);
    expect(result.totalCount).toBe(2);
    expect(mockLogger.error).toHaveBeenCalledWith(
      boom,
      'importSuppliers: failed to upsert row; skipping',
    );
  });

  it('importSuppliers: does not throw when all rows fail', async () => {
    (prisma.suppliers.upsert as any).mockRejectedValue(new Error('all fail'));

    const items = [
      { name: 'S1', code: 'C1', category: 'Supplier' },
      { name: 'S2', code: 'C2', category: 'Supplier' },
    ];
    const result = await SupplierService.importSuppliers(items);

    expect(result.successCount).toBe(0);
    expect(result.totalCount).toBe(2);
    expect(mockLogger.error).toHaveBeenCalledTimes(2);
  });
});
