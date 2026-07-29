import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VehicleFailureRateService } from '~/modules/report/vehicle-failure-rate.service';

vi.mock('~/modules/after-sales', () => ({
  AfterSalesAPI: {
    findEarliestVehicleFailureDate: vi.fn().mockResolvedValue(null),
    getVehicleFailureRecords: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('~/modules/dept/dept.service', () => ({
  DeptService: {
    findVehicleSobuIds: vi.fn().mockResolvedValue(['dept-v1']),
  },
}));

vi.mock('~/modules/work-order', () => ({
  WorkOrderService: {
    getWarrantySeeds: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('~/modules/quality-classification', () => {
  const listForManagement = vi.fn().mockResolvedValue([]);
  return {
    QualityClassificationService: {
      findActiveCategoryByCode: vi.fn().mockResolvedValue({
        code: 'VEHICLE_PRODUCT',
        id: 'vehicle-product',
        name: 'Vehicle Product',
      }),
      listForManagement,
      resolveCategoryNamesByIds: vi.fn(async () => {
        const categories = await listForManagement();
        return new Map(
          categories.map((item: { id: string; name: string }) => [
            item.id,
            item.name,
          ]),
        );
      }),
    },
  };
});

vi.mock('~/modules/report/vehicle-failure-rate-manual.service', () => ({
  getVehicleFailureManualData: vi.fn().mockResolvedValue({}),
  getVehicleFailureManualWarrantyData: vi.fn().mockResolvedValue({}),
  saveVehicleFailureManualPayload: vi.fn().mockResolvedValue({ success: true }),
}));

describe('vehicleFailureRateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns failure rate data with default month (current date)', async () => {
    const result = await VehicleFailureRateService.getVehicleFailureRate();

    expect(result).toHaveProperty('ranking');
    expect(result).toHaveProperty('trend');
    expect(result).toHaveProperty('yearIntensity');
    expect(result).toHaveProperty('yearSeries');
    expect(result).toHaveProperty('yearWarrantySeries');
    expect(result.ranking).toEqual([]);
    expect(result.trend).toBeInstanceOf(Array);
    expect(result.yearSeries).toBeInstanceOf(Array);
  });

  it('parses month parameter correctly', async () => {
    const result =
      await VehicleFailureRateService.getVehicleFailureRate('2026-03');

    expect(result).toHaveProperty('trend');
    expect(result.trend.length).toBeGreaterThan(0);
    expect(result.trend[0]).toHaveProperty('currentYear');
    expect(result.trend[0]).toHaveProperty('lastYear');
    expect(result.trend[0]).toHaveProperty('period');
  });

  it('falls back to current date for invalid month format', async () => {
    const result =
      await VehicleFailureRateService.getVehicleFailureRate('invalid');

    expect(result).toHaveProperty('trend');
    expect(result.trend.length).toBeGreaterThan(0);
  });

  it('falls back to current date for empty month', async () => {
    const result = await VehicleFailureRateService.getVehicleFailureRate('');

    expect(result).toHaveProperty('trend');
  });

  it('returns ranking based on failure records', async () => {
    const { AfterSalesAPI } = await import('~/modules/after-sales');
    const { QualityClassificationService } = await import(
      '~/modules/quality-classification'
    );
    vi.mocked(
      QualityClassificationService.listForManagement,
    ).mockResolvedValueOnce([
      {
        code: 'CRACK',
        id: 'dt-1',
        name: 'Crack',
        scope: 'AFTER_SALES_DEFECT',
        sort: 0,
        status: 1,
        subcategories: [],
      },
      {
        code: 'RUST',
        id: 'dt-2',
        name: 'Rust',
        scope: 'AFTER_SALES_DEFECT',
        sort: 1,
        status: 1,
        subcategories: [],
      },
    ]);
    (AfterSalesAPI.getVehicleFailureRecords as any).mockResolvedValue([
      {
        defectType: 'Crack',
        defectCategoryId: 'dt-1',
        occurDate: new Date('2026-01-10'),
      },
      {
        defectType: 'Crack',
        defectCategoryId: 'dt-1',
        occurDate: new Date('2026-02-15'),
      },
      {
        defectType: 'Rust',
        defectCategoryId: 'dt-2',
        occurDate: new Date('2026-01-20'),
      },
    ]);

    const result =
      await VehicleFailureRateService.getVehicleFailureRate('2026-06');

    expect(result.ranking.length).toBeGreaterThan(0);
    expect(result.ranking[0].defectType).toBeDefined();
    expect(result.ranking[0].count).toBeGreaterThan(0);
    expect(result.ranking[0].percentage).toBeGreaterThan(0);
  });

  it('keeps same-name IDs separate and preserves unresolved ID buckets', async () => {
    const { AfterSalesAPI } = await import('~/modules/after-sales');
    const { QualityClassificationService } = await import(
      '~/modules/quality-classification'
    );
    (AfterSalesAPI.getVehicleFailureRecords as any).mockResolvedValue([
      {
        defectCategoryId: 'dt-1',
        defectType: 'Old Name',
        occurDate: new Date(),
      },
      { defectCategoryId: 'dt-2', defectType: 'Same', occurDate: new Date() },
      { defectCategoryId: 'dt-3', defectType: 'Same', occurDate: new Date() },
      {
        defectCategoryId: 'bad-id',
        defectType: 'Must Not Be Used',
        occurDate: new Date(),
      },
      {
        defectCategoryId: null,
        defectType: 'Must Not Be Used',
        occurDate: new Date(),
      },
    ]);
    vi.mocked(
      QualityClassificationService.listForManagement,
    ).mockResolvedValueOnce(
      ['dt-1', 'dt-2', 'dt-3'].map((id, index) => ({
        code: id.toUpperCase(),
        id,
        name: index === 0 ? 'Current Name' : 'Same',
        scope: 'AFTER_SALES_DEFECT' as const,
        sort: index,
        status: 1 as const,
        subcategories: [],
      })),
    );

    const result =
      await VehicleFailureRateService.getVehicleFailureRate('2026-06');

    expect(result.ranking).toEqual([
      expect.objectContaining({
        count: 1,
        defectType: 'Current Name',
        id: 'dt-1',
        resolutionStatus: 'RESOLVED',
      }),
      expect.objectContaining({
        count: 1,
        defectType: 'Same',
        id: 'dt-2',
        resolutionStatus: 'RESOLVED',
      }),
      expect.objectContaining({
        count: 1,
        defectType: 'Same',
        id: 'dt-3',
        resolutionStatus: 'RESOLVED',
      }),
      expect.objectContaining({
        count: 1,
        defectType: '主数据已失效',
        id: 'bad-id',
        resolutionReason: 'INVALID_REFERENCE',
        resolutionStatus: 'INVALID',
      }),
      expect.objectContaining({
        count: 1,
        defectType: '未分类',
        id: null,
        resolutionReason: 'MISSING_REQUIRED',
        resolutionStatus: 'MISSING',
      }),
    ]);
  });

  it('manual data overrides automatic monthly counts in year series', async () => {
    const { getVehicleFailureManualData } = await import(
      '~/modules/report/vehicle-failure-rate-manual.service'
    );
    (getVehicleFailureManualData as any).mockResolvedValue({ '2026-01': 42 });

    const result =
      await VehicleFailureRateService.getVehicleFailureRate('2026-03');

    const currentYearSeries = result.yearSeries.find(
      (s: any) => s.year === 2026,
    );
    expect(currentYearSeries).toBeDefined();
    expect(currentYearSeries.values[0]).toBe(42);
    expect(currentYearSeries.manualOverrides[0]).toBe(true);
  });

  it('year intensity calculates correctly', async () => {
    const result =
      await VehicleFailureRateService.getVehicleFailureRate('2026-06');

    expect(result.yearIntensity).toBeInstanceOf(Array);
    if (result.yearIntensity.length > 0) {
      expect(result.yearIntensity[0]).toHaveProperty('year');
      expect(result.yearIntensity[0]).toHaveProperty('issueCount');
      expect(result.yearIntensity[0]).toHaveProperty('perVehicle');
      expect(result.yearIntensity[0]).toHaveProperty('intensityPct');
    }
  });

  it('delegates saveManualPayload to manual service', async () => {
    const { saveVehicleFailureManualPayload } = await import(
      '~/modules/report/vehicle-failure-rate-manual.service'
    );

    await VehicleFailureRateService.saveManualPayload({
      count: 10,
      month: '2026-01',
      updatedBy: 'admin',
    });

    expect(saveVehicleFailureManualPayload).toHaveBeenCalledWith({
      count: 10,
      month: '2026-01',
      updatedBy: 'admin',
    });
  });

  it('builds year series for multiple years', async () => {
    const { AfterSalesAPI } = await import('~/modules/after-sales');
    (AfterSalesAPI.findEarliestVehicleFailureDate as any).mockResolvedValue(
      new Date('2025-06-01'),
    );

    const result =
      await VehicleFailureRateService.getVehicleFailureRate('2026-03');

    const years = result.yearSeries.map((s: any) => s.year);
    expect(years).toContain(2026);
    expect(years).toContain(2025);
  });

  it('ranking limits to top 10 defect types', async () => {
    const { AfterSalesAPI } = await import('~/modules/after-sales');
    const manyRecords = Array.from({ length: 15 }, (_, i) => ({
      defectCategoryId: `dt-${i}`,
      defectType: `Defect ${String(i).padStart(2, '0')}`,
      occurDate: new Date('2026-01-01'),
    }));
    (AfterSalesAPI.getVehicleFailureRecords as any).mockResolvedValue(
      manyRecords,
    );

    const result =
      await VehicleFailureRateService.getVehicleFailureRate('2026-06');

    expect(result.ranking.length).toBeLessThanOrEqual(10);
  });
});
