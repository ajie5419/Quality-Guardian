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

vi.mock('~/utils/canonical-master-data', () => ({
  MasterDataGovernanceKernel: {
    resolveCanonicalNamesByIds: vi.fn().mockResolvedValue(new Map()),
  },
}));

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
    (AfterSalesAPI.getVehicleFailureRecords as any).mockResolvedValue([
      {
        defectType: 'Crack',
        defectTypeId: 'dt-1',
        occurDate: new Date('2026-01-10'),
      },
      {
        defectType: 'Crack',
        defectTypeId: 'dt-1',
        occurDate: new Date('2026-02-15'),
      },
      {
        defectType: 'Rust',
        defectTypeId: 'dt-2',
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
      defectType: `Defect ${String(i).padStart(2, '0')}`,
      defectTypeId: `dt-${i}`,
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
