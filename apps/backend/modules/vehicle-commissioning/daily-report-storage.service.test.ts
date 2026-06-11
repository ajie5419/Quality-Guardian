import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VehicleCommissioningDailyReportStorageService } from '~/modules/vehicle-commissioning/daily-report-storage.service';
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
  },
}));

describe('vehicleCommissioningDailyReportStorageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts a daily summary by date and reporter', async () => {
    const mockResult = {
      date: new Date('2026-01-15'),
      id: 'dr-1',
      reporter: 'Alice',
      reportText: 'summary text',
      summary: '{"summary":"test"}',
    };
    (prisma.daily_reports.upsert as any).mockResolvedValue(mockResult);

    const result =
      await VehicleCommissioningDailyReportStorageService.upsertDailySummary({
        date: new Date('2026-01-15'),
        reportText: 'summary text',
        reporter: 'Alice',
        summary: '{"summary":"test"}',
      });

    expect(result).toEqual(mockResult);
    expect(prisma.daily_reports.upsert).toHaveBeenCalledWith({
      where: {
        date_reporter: { date: new Date('2026-01-15'), reporter: 'Alice' },
      },
      update: { reportText: 'summary text', summary: '{"summary":"test"}' },
      create: {
        date: new Date('2026-01-15'),
        reportText: 'summary text',
        reporter: 'Alice',
        summary: '{"summary":"test"}',
      },
    });
  });

  it('creates a daily report', async () => {
    const input = {
      date: new Date('2026-02-01'),
      projectName: 'Project X',
      reporter: 'Bob',
      reportText: 'text',
      summary: 's',
      workOrderNumber: 'WO-1',
    };
    (prisma.daily_reports.create as any).mockResolvedValue({
      id: 'dr-2',
      ...input,
    });

    const result =
      await VehicleCommissioningDailyReportStorageService.createDailyReport(
        input,
      );

    expect(result).toEqual(expect.objectContaining({ id: 'dr-2' }));
    expect(prisma.daily_reports.create).toHaveBeenCalledWith({ data: input });
  });

  it('finds a daily report by id', async () => {
    (prisma.daily_reports.findUnique as any).mockResolvedValue({ id: 'dr-3' });

    const result =
      await VehicleCommissioningDailyReportStorageService.findDailyReportById(
        'dr-3',
      );

    expect(result).toEqual({ id: 'dr-3' });
    expect(prisma.daily_reports.findUnique).toHaveBeenCalledWith({
      where: { id: 'dr-3' },
    });
  });

  it('finds a daily report by date and reporter', async () => {
    (prisma.daily_reports.findUnique as any).mockResolvedValue({
      date: new Date('2026-03-10'),
      reporter: 'Carol',
    });

    const result =
      await VehicleCommissioningDailyReportStorageService.findDailyReportByDateReporter(
        {
          date: new Date('2026-03-10'),
          reporter: 'Carol',
        },
      );

    expect(result).toEqual({ date: new Date('2026-03-10'), reporter: 'Carol' });
    expect(prisma.daily_reports.findUnique).toHaveBeenCalledWith({
      where: {
        date_reporter: { date: new Date('2026-03-10'), reporter: 'Carol' },
      },
    });
  });

  it('counts daily reports with filters', async () => {
    (prisma.daily_reports.count as any).mockResolvedValue(5);

    const result =
      await VehicleCommissioningDailyReportStorageService.countDailyReports({
        dateFrom: new Date('2026-01-01'),
        dateTo: new Date('2026-01-31'),
        projectName: 'Project',
      });

    expect(result).toBe(5);
    expect(prisma.daily_reports.count).toHaveBeenCalledWith({
      where: {
        OR: [
          { projectName: { contains: 'Project' } },
          { summary: { contains: 'Project' } },
        ],
        date: {
          gte: new Date('2026-01-01'),
          lte: new Date('2026-01-31'),
        },
      },
    });
  });

  it('counts daily reports without filters', async () => {
    (prisma.daily_reports.count as any).mockResolvedValue(10);

    await VehicleCommissioningDailyReportStorageService.countDailyReports({});

    expect(prisma.daily_reports.count).toHaveBeenCalledWith({ where: {} });
  });

  it('finds daily reports with pagination', async () => {
    (prisma.daily_reports.findMany as any).mockResolvedValue([{ id: 'dr-1' }]);

    const result =
      await VehicleCommissioningDailyReportStorageService.findDailyReports({
        skip: 10,
        take: 5,
      });

    expect(result).toEqual([{ id: 'dr-1' }]);
    expect(prisma.daily_reports.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { date: 'desc' },
      skip: 10,
      take: 5,
    });
  });

  it('finds daily reports without pagination params', async () => {
    (prisma.daily_reports.findMany as any).mockResolvedValue([]);

    await VehicleCommissioningDailyReportStorageService.findDailyReports({});

    expect(prisma.daily_reports.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { date: 'desc' },
    });
  });

  it('finds daily reports filtered by date range only', async () => {
    (prisma.daily_reports.findMany as any).mockResolvedValue([{ id: 'dr-2' }]);

    await VehicleCommissioningDailyReportStorageService.findDailyReports({
      dateFrom: new Date('2026-06-01'),
    });

    expect(prisma.daily_reports.findMany).toHaveBeenCalledWith({
      where: {
        date: { gte: new Date('2026-06-01') },
      },
      orderBy: { date: 'desc' },
    });
  });

  it('finds daily reports filtered by projectName only', async () => {
    (prisma.daily_reports.findMany as any).mockResolvedValue([]);

    await VehicleCommissioningDailyReportStorageService.findDailyReports({
      projectName: 'Alpha',
    });

    expect(prisma.daily_reports.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { projectName: { contains: 'Alpha' } },
          { summary: { contains: 'Alpha' } },
        ],
      },
      orderBy: { date: 'desc' },
    });
  });

  it('returns null when daily report not found by id', async () => {
    (prisma.daily_reports.findUnique as any).mockResolvedValue(null);

    const result =
      await VehicleCommissioningDailyReportStorageService.findDailyReportById(
        'missing',
      );

    expect(result).toBeNull();
  });

  it('trims projectName before filtering', async () => {
    (prisma.daily_reports.findMany as any).mockResolvedValue([]);

    await VehicleCommissioningDailyReportStorageService.findDailyReports({
      projectName: '  Beta  ',
    });

    expect(prisma.daily_reports.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { projectName: { contains: 'Beta' } },
          { summary: { contains: 'Beta' } },
        ],
      },
      orderBy: { date: 'desc' },
    });
  });
});
