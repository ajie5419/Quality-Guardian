import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '../../utils/prisma';
import { SupplierService } from '../supplier.service';

vi.mock('../../utils/prisma', () => ({
  default: {
    suppliers: {
      count: vi.fn(),
      findMany: vi.fn(),
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

  (prisma.suppliers.findMany as any).mockResolvedValue(suppliers);
  (prisma.suppliers.count as any).mockResolvedValue(suppliers.length);
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

  it('sample 10: sorting by qualityScore desc should order suppliers correctly', async () => {
    setupScenario({
      suppliers: [supplier('S1'), supplier('S2'), supplier('S3')],
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
    expect(names).toEqual(['S1', 'S3', 'S2']);
  });

  it('sample 11: outsourcing category should use the same deduction/freeze rules', async () => {
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

    expect(row.status).toBe('Frozen');
    expect(row.qualityScore).toBe(0);
    expect(row.level).toBe('D');
  });
});
