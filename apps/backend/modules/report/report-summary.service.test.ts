import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportQueryValidationError } from '~/modules/report/report-query-validation-error';
import { ReportSummaryService } from '~/modules/report/report-summary.service';

vi.mock('~/modules/inspection', () => ({
  InspectionService: {
    getDailyArchiveReportData: vi
      .fn()
      .mockResolvedValue({ tasks: [], templates: [] }),
    getDailyReportInspections: vi.fn().mockResolvedValue([]),
    getDailyReportIssues: vi.fn().mockResolvedValue([]),
    getReportDefectRows: vi.fn().mockResolvedValue([]),
    getReportMajorEvents: vi.fn().mockResolvedValue([]),
    getReportPeriodMetrics: vi.fn().mockResolvedValue({
      closedIssues: 0,
      internalLoss: 0,
      newIssues: 0,
    }),
    getReportSupplierPerformance: vi.fn().mockResolvedValue([]),
    getReportTopRiskProjects: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('~/modules/after-sales', () => ({
  AfterSalesAPI: {
    getReportPeriodMetrics: vi
      .fn()
      .mockResolvedValue({ grossCost: 0, netLoss: 0, recovered: 0 }),
  },
}));

vi.mock('~/modules/quality-loss', () => ({
  QualityLossService: {
    getReportPeriodMetrics: vi.fn().mockResolvedValue({ manualLoss: 0 }),
  },
}));

vi.mock('~/modules/report/pass-rate', () => ({
  createPassRateTargetResolver: vi.fn().mockResolvedValue(() => 95),
  getNetPassRateSummaryByRange: vi.fn().mockResolvedValue({
    passRate: 98.5,
    passCount: 100,
    totalCount: 101,
  }),
  getPassRateDrillDownByRange: vi.fn().mockResolvedValue([]),
}));

vi.mock('~/utils/canonical-master-data', () => ({
  MasterDataGovernanceKernel: {
    resolveCanonicalNamesByIds: vi.fn().mockResolvedValue(new Map()),
  },
}));

vi.mock('~/modules/vehicle-commissioning/daily-report-storage.service', () => ({
  VehicleCommissioningDailyReportStorageService: {
    findDailyReportByDateReporter: vi.fn().mockResolvedValue(null),
  },
}));

describe('reportSummaryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('identifies ReportQueryValidationError instances', () => {
    const validationError = new ReportQueryValidationError('test');
    expect(ReportSummaryService.isValidationError(validationError)).toBe(true);
    expect(ReportSummaryService.isValidationError(new Error('test'))).toBe(
      false,
    );
    expect(ReportSummaryService.isValidationError(null)).toBe(false);
  });

  it('throws ReportQueryValidationError for invalid type parameter in getSummaryFromQuery', async () => {
    await expect(
      ReportSummaryService.getSummaryFromQuery('invalid', '2026-01-15'),
    ).rejects.toThrow(ReportQueryValidationError);
  });

  it('throws ReportQueryValidationError for invalid date parameter in getSummaryFromQuery', async () => {
    await expect(
      ReportSummaryService.getSummaryFromQuery('monthly', 'not-a-date'),
    ).rejects.toThrow(ReportQueryValidationError);
  });

  it('delegates getDailySummaryFromQuery to ReportDailySummaryService', async () => {
    const result = await ReportSummaryService.getDailySummaryFromQuery({
      date: '2026-06-15',
      username: 'admin',
    });

    expect(result).toBeDefined();
    expect(result).toHaveProperty('date');
    expect(result).toHaveProperty('inspections');
    expect(result).toHaveProperty('issues');
  });

  it('returns summary structure with correct metric labels for monthly type', async () => {
    const result = await ReportSummaryService.getSummary(
      'monthly',
      new Date('2026-03-15'),
    );

    expect(result.title).toBe('月度质量分析报告');
    expect(result.period).toBeDefined();
    expect(result.metrics).toHaveLength(4);
    expect(result.metrics[0].label).toBe('综合合格率');
    expect(result.metrics[0].unit).toBe('%');
    expect(result.metrics[1].label).toBe('制造损失');
    expect(result.metrics[1].unit).toBe('¥');
    expect(result.metrics[2].label).toBe('售后损失');
    expect(result.metrics[2].unit).toBe('¥');
    expect(result.metrics[3].label).toBe('问题结案率');
    expect(result.metrics[3].unit).toBe('%');
  });

  it('returns summary structure for weekly type', async () => {
    const result = await ReportSummaryService.getSummary(
      'weekly',
      new Date('2026-03-15'),
    );

    expect(result.title).toBe('周度质量分析报告');
    expect(result.historyLabels).toBeDefined();
    expect(result.defects).toBeDefined();
    expect(result.topProjects).toBeDefined();
    expect(result.suppliers).toHaveProperty('best');
    expect(result.suppliers).toHaveProperty('worst');
    expect(result.majorEvents).toBeDefined();
    expect(result.processPassRates).toBeDefined();
  });

  it('uses netLoss (grossCost - recovered) as the external-loss KPI', async () => {
    const { AfterSalesAPI } = await import('~/modules/after-sales');
    vi.mocked(AfterSalesAPI.getReportPeriodMetrics).mockResolvedValue({
      grossCost: 100,
      netLoss: 70,
      recovered: 30,
    } as any);

    const result = await ReportSummaryService.getSummary(
      'monthly',
      new Date('2026-03-15'),
    );
    const externalKpi = result.metrics.find((m) => m.label === '售后损失');
    expect(externalKpi?.value).toBe(70);
    expect(externalKpi?.desc).toBe('售后总成本扣减已追偿');
  });

  it('returns empty defects when no defect rows exist', async () => {
    const result = await ReportSummaryService.getSummary(
      'monthly',
      new Date('2026-03-15'),
    );

    expect(result.defects).toEqual([]);
  });

  it('returns empty majorEvents when no events exist', async () => {
    const result = await ReportSummaryService.getSummary(
      'monthly',
      new Date('2026-03-15'),
    );

    expect(result.majorEvents).toEqual([]);
  });

  it('returns empty topProjects when no projects exist', async () => {
    const result = await ReportSummaryService.getSummary(
      'monthly',
      new Date('2026-03-15'),
    );

    expect(result.topProjects).toEqual([]);
  });

  it('returns empty suppliers when no supplier data exists', async () => {
    const result = await ReportSummaryService.getSummary(
      'monthly',
      new Date('2026-03-15'),
    );

    expect(result.suppliers.best).toEqual([]);
    expect(result.suppliers.worst).toEqual([]);
  });

  it('returns 6 history labels for both weekly and monthly', async () => {
    const monthlyResult = await ReportSummaryService.getSummary(
      'monthly',
      new Date('2026-03-15'),
    );
    const weeklyResult = await ReportSummaryService.getSummary(
      'weekly',
      new Date('2026-03-15'),
    );

    expect(monthlyResult.historyLabels).toHaveLength(6);
    expect(weeklyResult.historyLabels).toHaveLength(6);
  });
});
