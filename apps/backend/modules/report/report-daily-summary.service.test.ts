import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportDailySummaryService } from '~/modules/report/report-daily-summary.service';
import { VehicleCommissioningDailyReportStorageService } from '~/modules/vehicle-commissioning/daily-report-storage.service';

import { ReportWriteService } from './report-write.service';

vi.mock('~/utils/prisma', () => ({ default: {} }));
vi.mock('~/modules/system-log', () => ({
  SystemLogService: { auditLog: vi.fn() },
}));

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
    upsertDailySummary: vi.fn(),
  },
}));

vi.mock('~/modules/dept', () => ({
  DeptService: {
    resolveActiveNamesByIds: vi.fn().mockResolvedValue(new Map()),
  },
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaSchemaMismatchError: vi.fn().mockReturnValue(false),
}));

vi.mock('~/utils/process-resolver', () => ({
  resolveCanonicalProcessName: vi.fn().mockReturnValue(''),
}));

const testAccess = { user: { userId: 'u1', username: 'admin' } };

describe('reportDailySummaryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads back a saved summary using username even when the display name differs', async () => {
    const storage = VehicleCommissioningDailyReportStorageService;
    const rows = new Map<string, any>();
    vi.mocked(storage.upsertDailySummary).mockImplementationOnce(
      async (input) => {
        rows.set(`${input.date.toISOString()}:${input.reporter}`, input);
        return input as any;
      },
    );
    vi.mocked(storage.findDailyReportByDateReporter).mockImplementationOnce(
      async (input) =>
        rows.get(`${input.date.toISOString()}:${input.reporter}`) ?? null,
    );
    await ReportWriteService.saveDailySummary({
      date: '2026-09-05',
      summary: 'Saved content',
      userinfo: {
        id: 'u1',
        username: 'admin',
        realName: 'Different Name',
        roles: [],
      } as any,
    });
    const result = await ReportDailySummaryService.getDailySummaryFromQuery(
      {
        date: '2026-09-05',
        username: 'admin',
        realName: 'Different Name',
        user: 'someone-else',
      },
      testAccess,
    );
    expect(result.summary).toBe('Saved content');
    expect(result.reporter).toBe('Different Name');
    expect([...rows.keys()]).toHaveLength(1);
    expect([...rows.keys()][0]).toMatch(/:admin$/);
  });

  it('returns daily summary with default values for empty inspections', async () => {
    const result = await ReportDailySummaryService.getDailySummaryFromQuery(
      {
        username: 'admin',
      },
      testAccess,
    );

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

  it('reads legacy midnight records without falling back to display-name ownership', async () => {
    const lookup = vi.mocked(
      VehicleCommissioningDailyReportStorageService.findDailyReportByDateReporter,
    );
    lookup
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ reportText: 'Legacy content' } as any);
    const result = await ReportDailySummaryService.getDailySummaryFromQuery(
      {
        date: '2026-09-05',
        username: 'admin',
        realName: 'Shared Name',
      },
      testAccess,
    );
    expect(result.summary).toBe('Legacy content');
    expect(lookup).toHaveBeenLastCalledWith({
      date: new Date('2026-09-05'),
      reporter: 'admin',
    });
    expect(
      lookup.mock.calls.every(([input]) => input.reporter === 'admin'),
    ).toBe(true);
  });

  it('uses realName as reporter when provided', async () => {
    const result = await ReportDailySummaryService.getDailySummaryFromQuery(
      {
        realName: 'Alice',
        username: 'admin',
      },
      testAccess,
    );

    expect(result.reporter).toBe('Alice');
  });

  it('ignores the arbitrary user param and reports under the current user', async () => {
    const result = await ReportDailySummaryService.getDailySummaryFromQuery(
      {
        user: 'operator',
        username: 'admin',
      },
      testAccess,
    );

    // SEC-ANALYTICS-SCOPE-001: the legacy `user` query parameter could
    // address an arbitrary username (cross-user read); row filters and the
    // reporter label now always derive from the current user.
    expect(result.reporter).toBe('admin');
  });

  it('falls back to username when neither realName nor user is provided', async () => {
    const result = await ReportDailySummaryService.getDailySummaryFromQuery(
      {
        username: 'admin',
      },
      testAccess,
    );

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

    const result = await ReportDailySummaryService.getDailySummaryFromQuery(
      {
        username: 'admin',
      },
      testAccess,
    );

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

    const result = await ReportDailySummaryService.getDailySummaryFromQuery(
      {
        username: 'admin',
      },
      testAccess,
    );

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

    const result = await ReportDailySummaryService.getDailySummaryFromQuery(
      {
        username: 'admin',
      },
      testAccess,
    );

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
        responsibleDepartmentId: null,
        solution: 'Polish',
        status: 'OPEN',
        workOrderNumber: 'WO-1',
        work_orders: { projectName: 'P1' },
      },
    ]);

    const result = await ReportDailySummaryService.getDailySummaryFromQuery(
      {
        date: '2026-06-15',
        username: 'admin',
      },
      testAccess,
    );

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].description).toBe('Surface scratch');
    expect(result.issues[0].dept).toBe('数据待治理：Dept1');
    expect(result.issues[0].partName).toBe('Panel');
    expect(result.issues[0].status).toBe('OPEN');
    expect(result.issues[0].seq).toBe(1);
  });

  it('uses canonical department and work-order project names', async () => {
    const { InspectionService } = await import('~/modules/inspection');
    const { DeptService } = await import('~/modules/dept');
    vi.mocked(DeptService.resolveActiveNamesByIds).mockResolvedValue(
      new Map([['dept-1', 'Renamed Department']]),
    );
    (InspectionService.getDailyReportIssues as any).mockResolvedValue([
      {
        createdAt: new Date('2026-06-15T10:00:00.000Z'),
        description: 'Surface scratch',
        partName: 'Panel',
        projectName: 'Old Project',
        responsibleDepartment: 'Old Department',
        responsibleDepartmentId: 'dept-1',
        solution: 'Polish',
        status: 'OPEN',
        workOrderNumber: 'WO-1',
        work_orders: { projectName: 'Renamed Project' },
      },
    ]);

    const result = await ReportDailySummaryService.getDailySummaryFromQuery(
      {
        date: '2026-06-15',
        username: 'admin',
      },
      testAccess,
    );

    expect(result.issues[0]).toMatchObject({
      dept: 'Renamed Department',
      projectName: 'Renamed Project',
    });
  });

  it('returns archive stats with zero values when no archive data', async () => {
    const { InspectionService } = await import('~/modules/inspection');
    (InspectionService.getDailyReportInspections as any).mockResolvedValue([]);
    (InspectionService.getDailyReportIssues as any).mockResolvedValue([]);

    const result = await ReportDailySummaryService.getDailySummaryFromQuery(
      {
        username: 'admin',
      },
      testAccess,
    );

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

    const result = await ReportDailySummaryService.getDailySummaryFromQuery(
      {
        username: 'admin',
      },
      testAccess,
    );

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

    const result = await ReportDailySummaryService.getDailySummaryFromQuery(
      {
        username: 'admin',
      },
      testAccess,
    );

    expect(result.summary).toBe('Existing report');
  });
});
