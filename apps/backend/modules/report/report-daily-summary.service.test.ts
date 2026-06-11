import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportDailySummaryService } from '~/modules/report/report-daily-summary.service';

vi.mock('~/modules/inspection', () => ({
  InspectionService: {
    getDailyArchiveReportData: vi
      .fn()
      .mockResolvedValue({ tasks: [], templates: [] }),
    getDailyReportInspections: vi.fn().mockResolvedValue([]),
    getDailyReportIssues: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('~/modules/inspection/inspection-form', () => ({
  resolveInspectionFormProcess: vi.fn().mockReturnValue(''),
  resolveInspectionFormProcessCandidates: vi.fn().mockReturnValue([]),
}));

vi.mock('~/modules/vehicle-commissioning/daily-report-storage.service', () => ({
  VehicleCommissioningDailyReportStorageService: {
    findDailyReportByDateReporter: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaSchemaMismatchError: vi.fn().mockReturnValue(false),
}));

vi.mock('~/utils/process-resolver', () => ({
  resolveCanonicalProcessName: vi.fn().mockReturnValue(''),
}));

describe('reportDailySummaryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns daily summary with default values for empty inspections', async () => {
    const result = await ReportDailySummaryService.getDailySummaryFromQuery({
      username: 'admin',
    });

    expect(result).toHaveProperty('date');
    expect(result).toHaveProperty('inspections');
    expect(result).toHaveProperty('issues');
    expect(result).toHaveProperty('reporter');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('archiveStats');
    expect(result).toHaveProperty('documentItems');
    expect(result).toHaveProperty('engineeringTodos');
    expect(result.inspections).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.reporter).toBe('admin');
  });

  it('uses realName as reporter when provided', async () => {
    const result = await ReportDailySummaryService.getDailySummaryFromQuery({
      realName: 'Alice',
      username: 'admin',
    });

    expect(result.reporter).toBe('Alice');
  });

  it('falls back to user field for reporter when realName is not provided', async () => {
    const result = await ReportDailySummaryService.getDailySummaryFromQuery({
      user: 'operator',
      username: 'admin',
    });

    expect(result.reporter).toBe('operator');
  });

  it('falls back to username when neither realName nor user is provided', async () => {
    const result = await ReportDailySummaryService.getDailySummaryFromQuery({
      username: 'admin',
    });

    expect(result.reporter).toBe('admin');
  });

  it('formats inspection rows from InspectionService data', async () => {
    const { InspectionService } = await import('~/modules/inspection');
    (InspectionService.getDailyReportInspections as any).mockResolvedValue([
      {
        category: 'INCOMING',
        id: 'insp-1',
        materialName: 'Steel Sheet',
        projectName: 'P1',
        quantity: 10,
        result: 'PASS',
        workOrderNumber: 'WO-1',
      },
    ]);

    const result = await ReportDailySummaryService.getDailySummaryFromQuery({
      username: 'admin',
    });

    expect(result.inspections).toHaveLength(1);
    expect(result.inspections[0].process).toBe('进货检验');
    expect(result.inspections[0].partName).toBe('Steel Sheet');
    expect(result.inspections[0].result).toBe('合格');
    expect(result.inspections[0].seq).toBe(1);
  });

  it('formats process inspection rows', async () => {
    const { InspectionService } = await import('~/modules/inspection');
    (InspectionService.getDailyReportInspections as any).mockResolvedValue([
      {
        category: 'PROCESS',
        id: 'insp-2',
        level1Component: 'Chassis',
        level2Component: 'Frame',
        projectName: 'P2',
        quantity: 5,
        result: 'FAIL',
        workOrderNumber: 'WO-2',
      },
    ]);

    const result = await ReportDailySummaryService.getDailySummaryFromQuery({
      username: 'admin',
    });

    expect(result.inspections[0].result).toBe('不合格');
    expect(result.inspections[0].partName).toBe('Frame');
  });

  it('formats shipment inspection rows', async () => {
    const { InspectionService } = await import('~/modules/inspection');
    (InspectionService.getDailyReportInspections as any).mockResolvedValue([
      {
        category: 'SHIPMENT',
        id: 'insp-3',
        level1Component: 'Engine',
        materialName: 'Motor',
        projectName: 'P3',
        quantity: 2,
        result: 'PASS',
        workOrderNumber: 'WO-3',
      },
    ]);

    const result = await ReportDailySummaryService.getDailySummaryFromQuery({
      username: 'admin',
    });

    expect(result.inspections[0].process).toBe('发货检验');
    expect(result.inspections[0].partName).toBe('Motor');
  });

  it('formats issue rows from InspectionService data', async () => {
    const { InspectionService } = await import('~/modules/inspection');
    (InspectionService.getDailyReportIssues as any).mockResolvedValue([
      {
        createdAt: new Date('2026-06-15T10:00:00.000Z'),
        description: 'Surface scratch',
        partName: 'Panel',
        projectName: 'P1',
        responsibleDepartment: 'Dept1',
        solution: 'Polish',
        status: 'OPEN',
        workOrderNumber: 'WO-1',
        work_orders: { projectName: 'P1' },
      },
    ]);

    const result = await ReportDailySummaryService.getDailySummaryFromQuery({
      date: '2026-06-15',
      username: 'admin',
    });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].description).toBe('Surface scratch');
    expect(result.issues[0].partName).toBe('Panel');
    expect(result.issues[0].status).toBe('OPEN');
    expect(result.issues[0].seq).toBe(1);
  });

  it('returns archive stats with zero values when no archive data', async () => {
    const { InspectionService } = await import('~/modules/inspection');
    (InspectionService.getDailyReportInspections as any).mockResolvedValue([]);
    (InspectionService.getDailyReportIssues as any).mockResolvedValue([]);

    const result = await ReportDailySummaryService.getDailySummaryFromQuery({
      username: 'admin',
    });

    expect(result.archiveStats).toEqual({
      archivedCount: 0,
      missingTemplateCount: 0,
      overdueCount: 0,
      requiredCount: 0,
      timelinessRate: 0,
    });
  });

  it('returns empty documentItems and engineeringTodos when no data', async () => {
    const { InspectionService } = await import('~/modules/inspection');
    (InspectionService.getDailyReportInspections as any).mockResolvedValue([]);
    (InspectionService.getDailyReportIssues as any).mockResolvedValue([]);

    const result = await ReportDailySummaryService.getDailySummaryFromQuery({
      username: 'admin',
    });

    expect(result.documentItems).toEqual([]);
    expect(result.engineeringTodos).toEqual([]);
  });

  it('uses existing daily report summary when found', async () => {
    const { VehicleCommissioningDailyReportStorageService } = await import(
      '~/modules/vehicle-commissioning/daily-report-storage.service'
    );
    (
      VehicleCommissioningDailyReportStorageService.findDailyReportByDateReporter as any
    ).mockResolvedValue({
      reportText: 'Existing report',
      summary: '{"summary":"content"}',
    });

    const result = await ReportDailySummaryService.getDailySummaryFromQuery({
      username: 'admin',
    });

    expect(result.summary).toBe('Existing report');
  });
});
