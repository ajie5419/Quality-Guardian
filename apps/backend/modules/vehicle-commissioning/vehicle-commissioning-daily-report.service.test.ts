import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VehicleCommissioningDailyReportStorageService } from '~/modules/vehicle-commissioning/daily-report-storage.service';
import { VehicleCommissioningDailyReportService } from '~/modules/vehicle-commissioning/vehicle-commissioning-daily-report.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    daily_reports: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    vehicle_commissioning_issues: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('~/modules/report', () => ({
  ReportRouteService: {
    countDailyReports: vi.fn(),
    createDailyReport: vi.fn(),
    findDailyReportById: vi.fn(),
    findDailyReports: vi.fn(),
  },
}));

const issue = {
  claimNotes: null,
  claimStatus: 'OPEN',
  closedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  date: new Date('2026-01-01T00:00:00.000Z'),
  description: 'Brake issue',
  id: 'issue-1',
  isClaim: false,
  issuePhoto: '[]',
  lossAmount: 0,
  partName: 'Brake',
  projectName: 'Project A',
  recoveredAmount: 0,
  responsibleDepartment: 'Debug',
  severity: 'critical',
  solution: null,
  status: 'OPEN',
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  workOrderNumber: 'WO-1',
};

const reportRow = {
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  date: new Date('2026-01-01T00:00:00.000Z'),
  id: 'report-1',
  projectName: 'Project A',
  reporter: 'Alice Bob',
  reportText: null,
  summary: JSON.stringify({
    date: '2026-01-01',
    issueIds: ['issue-1'],
    mainWorks: ['1、Brake inspection'],
    notes: 'note',
    projectName: 'Project A',
    reporters: ['Alice', 'Bob'],
    workOrderNumber: 'WO-1',
  }),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  workOrderNumber: 'WO-1',
};

describe('vehicleCommissioningDailyReportStorageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts daily summary by date and reporter', async () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    await VehicleCommissioningDailyReportStorageService.upsertDailySummary({
      date,
      reporter: 'Alice',
      reportText: 'text',
      summary: '{}',
    });

    expect(prisma.daily_reports.upsert).toHaveBeenCalledWith({
      where: { date_reporter: { date, reporter: 'Alice' } },
      update: { reportText: 'text', summary: '{}' },
      create: { date, reporter: 'Alice', reportText: 'text', summary: '{}' },
    });
  });

  it('creates and finds daily reports through storage queries', async () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    await VehicleCommissioningDailyReportStorageService.createDailyReport({
      date,
      projectName: 'Project A',
      reporter: 'Alice',
      reportText: 'text',
      summary: '{}',
      workOrderNumber: 'WO-1',
    });
    await VehicleCommissioningDailyReportStorageService.findDailyReportById(
      'report-1',
    );
    await VehicleCommissioningDailyReportStorageService.findDailyReportByDateReporter(
      { date, reporter: 'Alice' },
    );

    expect(prisma.daily_reports.create).toHaveBeenCalledWith({
      data: {
        date,
        projectName: 'Project A',
        reporter: 'Alice',
        reportText: 'text',
        summary: '{}',
        workOrderNumber: 'WO-1',
      },
    });
    expect(prisma.daily_reports.findUnique).toHaveBeenCalledWith({
      where: { id: 'report-1' },
    });
    expect(prisma.daily_reports.findUnique).toHaveBeenCalledWith({
      where: { date_reporter: { date, reporter: 'Alice' } },
    });
  });

  it('counts and lists daily reports with date and project filters', async () => {
    const dateFrom = new Date('2026-01-01T00:00:00.000Z');
    const dateTo = new Date('2026-01-31T00:00:00.000Z');

    await VehicleCommissioningDailyReportStorageService.countDailyReports({
      dateFrom,
      dateTo,
      projectName: 'Project',
    });
    await VehicleCommissioningDailyReportStorageService.findDailyReports({
      dateFrom,
      projectName: 'Project',
      skip: 10,
      take: 5,
    });

    expect(prisma.daily_reports.count).toHaveBeenCalledWith({
      where: {
        OR: [
          { projectName: { contains: 'Project' } },
          { summary: { contains: 'Project' } },
        ],
        date: { gte: dateFrom, lte: dateTo },
      },
    });
    expect(prisma.daily_reports.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { projectName: { contains: 'Project' } },
          { summary: { contains: 'Project' } },
        ],
        date: { gte: dateFrom },
      },
      orderBy: { date: 'desc' },
      skip: 10,
      take: 5,
    });
  });
});

describe('vehicleCommissioningDailyReportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates report text from matching issues and normalized main works', async () => {
    const { ReportRouteService } = await import('~/modules/report');
    vi.mocked(prisma.vehicle_commissioning_issues.findMany).mockResolvedValue([
      issue,
    ] as never);
    vi.mocked(ReportRouteService.createDailyReport).mockResolvedValue(
      reportRow as never,
    );

    const result =
      await VehicleCommissioningDailyReportService.createDailyReport({
        date: '2026-01-01',
        issueIds: ['issue-1'],
        mainWorks: ['1、Brake inspection'],
        notes: 'note',
        projectName: 'Project A',
        reporters: ['Alice', 'Bob'],
        workOrderNumber: 'WO-1',
      });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'report-1',
        issueIds: ['issue-1'],
        mainWorks: ['Brake inspection'],
      }),
    );
    expect(ReportRouteService.createDailyReport).toHaveBeenCalledWith(
      expect.objectContaining({
        projectName: 'Project A',
        reporter: 'Alice Bob',
        workOrderNumber: 'WO-1',
      }),
    );
  });

  it('lists reports with date boundaries and filters invalid summaries', async () => {
    const { ReportRouteService } = await import('~/modules/report');
    vi.mocked(ReportRouteService.findDailyReports).mockResolvedValue([
      reportRow,
      { ...reportRow, id: 'invalid', projectName: '', summary: 'bad-json' },
    ] as never);
    vi.mocked(ReportRouteService.countDailyReports).mockResolvedValue(
      2 as never,
    );
    vi.mocked(prisma.vehicle_commissioning_issues.findMany).mockResolvedValue([
      issue,
    ] as never);

    const result = await VehicleCommissioningDailyReportService.getDailyReports(
      {
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
        page: 2,
        pageSize: 500,
        projectName: 'Project',
      },
    );

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.id)).toEqual(['report-1']);
    expect(ReportRouteService.findDailyReports).toHaveBeenCalledWith({
      dateFrom: new Date('2026-01-01T00:00:00'),
      dateTo: new Date('2026-01-31T23:59:59.999'),
      projectName: 'Project',
      skip: 100,
      take: 100,
    });
  });

  it('returns null preview when report does not exist', async () => {
    const { ReportRouteService } = await import('~/modules/report');
    vi.mocked(ReportRouteService.findDailyReportById).mockResolvedValue(null);

    await expect(
      VehicleCommissioningDailyReportService.getDailyReportPreview('missing'),
    ).resolves.toBeNull();
  });
});
