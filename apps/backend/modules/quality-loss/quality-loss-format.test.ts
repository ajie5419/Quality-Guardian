import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it, vi } from 'vitest';
import {
  buildManualLossesWhere,
  formatCommissioningIssueItem,
  formatExternalSalesItem,
  formatInternalRecordItem,
  formatManualLossItem,
  formatTrendItem,
  getWeekOfYear,
  mergeTrendData,
  normalizeLossSourceFilter,
  sortByDateDesc,
} from '~/modules/quality-loss/quality-loss-format';

vi.mock('@qgs/shared', async () => {
  const actual =
    await vi.importActual<typeof import('@qgs/shared')>('@qgs/shared');
  return {
    ...actual,
    isValidQualityLossStatus: (status: string) =>
      ['CONFIRMED', 'PENDING', 'PROCESSING', 'RESOLVED'].includes(
        String(status || '')
          .trim()
          .toUpperCase(),
      ),
  };
});

describe('quality-loss format helpers', () => {
  it('builds manual loss filters by normalized status and year range', () => {
    const where = buildManualLossesWhere({
      status: 'confirmed',
      year: 2026,
    });

    expect(where).toEqual({
      isDeleted: false,
      occurDate: {
        gte: new Date('2026-01-01T00:00:00.000Z'),
        lte: new Date('2026-12-31T23:59:59.999Z'),
      },
      status: 'Confirmed',
    });
  });

  it('formats manual, internal, external, and commissioning quality loss items', () => {
    const manual = formatManualLossItem({
      actualClaim: new Decimal(20),
      amount: new Decimal(100),
      id: 'manual-pk',
      lossId: '',
      occurDate: new Date('2026-01-01T00:00:00.000Z'),
      projectName: null,
      respDept: 'QA',
      status: 'pending',
      type: 'Material',
      workOrderNumber: null,
    });
    const internal = formatInternalRecordItem({
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      date: new Date('2026-01-02T00:00:00.000Z'),
      description: '',
      id: 'internal-pk',
      lossAmount: new Decimal(200),
      partName: null,
      projectName: null,
      recoveredAmount: new Decimal(30),
      responsibleDepartment: 'QC',
      serialNumber: 7,
      status: 'closed',
      workOrderNumber: null,
    });
    const external = formatExternalSalesItem({
      actualClaim: new Decimal(40),
      claimStatus: 'completed',
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
      id: 'external-pk',
      issueDescription: 'Issue',
      laborTravelCost: new Decimal(25),
      materialCost: new Decimal(75),
      occurDate: new Date('2026-01-03T00:00:00.000Z'),
      partName: null,
      productSubtype: 'Subtype',
      productType: 'Type',
      projectName: null,
      respDept: 'Service',
      serialNumber: 8,
      workOrderNumber: null,
    });
    const commissioning = formatCommissioningIssueItem({
      claimNotes: 'Claim note',
      claimStatus: 'processing',
      createdAt: new Date('2026-01-04T00:00:00.000Z'),
      date: new Date('2026-01-04T00:00:00.000Z'),
      description: 'Description',
      id: 'commissioning-pk',
      lossAmount: new Decimal(300),
      partName: null,
      projectName: null,
      recoveredAmount: new Decimal(50),
      responsibleDepartment: 'Debug',
      workOrderNumber: null,
    });

    expect(manual).toEqual(
      expect.objectContaining({
        actualClaim: 20,
        amount: 100,
        id: 'manual-pk',
        lossSource: 'Manual',
        projectName: '-',
        status: 'Pending',
      }),
    );
    expect(internal).toEqual(
      expect.objectContaining({
        actualClaim: 30,
        amount: 200,
        id: 'INT-7',
        lossSource: 'Internal',
        partName: '-',
        status: 'Confirmed',
      }),
    );
    expect(external).toEqual(
      expect.objectContaining({
        amount: 100,
        id: 'EXT-8',
        lossSource: 'External',
        partName: 'Subtype',
        status: 'Confirmed',
      }),
    );
    expect(commissioning).toEqual(
      expect.objectContaining({
        amount: 300,
        description: 'Claim note',
        id: 'commissioning-pk',
        lossSource: 'Commissioning',
      }),
    );
  });

  it('drops zero-amount external sales items', () => {
    expect(
      formatExternalSalesItem({
        actualClaim: null,
        claimStatus: 'pending',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        id: 'external-pk',
        issueDescription: null,
        laborTravelCost: null,
        materialCost: null,
        occurDate: new Date('2026-01-01T00:00:00.000Z'),
        partName: null,
        productSubtype: null,
        productType: null,
        projectName: null,
        respDept: null,
        serialNumber: 1,
        workOrderNumber: null,
      }),
    ).toBeNull();
  });

  it('sorts by date, normalizes source filters, and calculates week number', () => {
    expect(getWeekOfYear(new Date('2026-01-01T00:00:00.000Z'))).toBe(1);
    expect(normalizeLossSourceFilter('manual')).toBe('Manual');
    expect(normalizeLossSourceFilter('unknown')).toBe('Manual');
    expect(
      sortByDateDesc([
        { date: '2026-01-01', id: 'old' } as any,
        { date: '2026-01-03', id: 'new' } as any,
      ]).map((item) => item.id),
    ).toEqual(['new', 'old']);
  });

  it('merges trend rows and formats trend totals', () => {
    const merged = mergeTrendData(
      [{ a: new Decimal(10), p: 1 }],
      [{ a: 20, p: 1 }],
      [{ a: 30n, p: 2 }],
      [
        { a: 5, p: 0 },
        { a: 40, p: 1 },
      ],
      'month',
    );

    expect([...merged.keys()].sort()).toEqual([1, 2]);
    const monthOne = merged.get(1);
    expect(monthOne).toBeDefined();
    expect(
      formatTrendItem('Jan', monthOne as NonNullable<typeof monthOne>),
    ).toEqual({
      commissioningAmount: 40,
      externalAmount: 0,
      internalAmount: 20,
      manualAmount: 10,
      period: 'Jan',
      totalAmount: 70,
    });
  });

  it('keeps period zero for weekly trend data', () => {
    const merged = mergeTrendData([{ a: 10, p: 0 }], [], [], [], 'week');

    expect(merged.get(0)?.manual).toBe(10);
  });
});
