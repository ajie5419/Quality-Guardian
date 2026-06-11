import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportRouteService } from '~/modules/report/report-route.service';
import { VehicleCommissioningDailyReportStorageService } from '~/modules/vehicle-commissioning/daily-report-storage.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    reports: {
      create: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('~/modules/vehicle-commissioning/daily-report-storage.service', () => ({
  VehicleCommissioningDailyReportStorageService: {
    countDailyReports: vi.fn(),
    createDailyReport: vi.fn(),
    findDailyReportById: vi.fn(),
    findDailyReports: vi.fn(),
    upsertDailySummary: vi.fn(),
  },
}));

describe('reportRouteService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a report by id', async () => {
    (prisma.reports.delete as any).mockResolvedValue({ id: 'r-1' });

    const result = await ReportRouteService.deleteById('r-1');

    expect(result).toEqual({ message: 'Deleted' });
    expect(prisma.reports.delete).toHaveBeenCalledWith({
      where: { id: 'r-1' },
    });
  });

  it('returns list of reports ordered by date desc', async () => {
    (prisma.reports.findMany as any).mockResolvedValue([
      { date: new Date('2026-01-10'), id: 'r-2' },
      { date: new Date('2026-01-01'), id: 'r-1' },
    ]);

    const result = await ReportRouteService.getList();

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('r-2');
    expect(prisma.reports.findMany).toHaveBeenCalledWith({
      orderBy: { date: 'desc' },
    });
  });

  it('creates a report with parsed fields', async () => {
    const mockCreated = {
      author: 'admin',
      date: new Date('2026-03-01'),
      id: 'r-3',
      majorDefects: 2,
      minorDefects: 5,
      passRate: 95,
      status: 'DRAFT',
      totalInspections: 100,
    };
    (prisma.reports.create as any).mockResolvedValue(mockCreated);

    const result = await ReportRouteService.create({
      body: {
        author: 'admin',
        date: '2026-03-01',
        majorDefects: '2',
        minorDefects: '5',
        passRate: 95,
        status: 'draft',
        totalInspections: '100',
      },
      fallbackAuthor: 'fallback',
    });

    expect(result.id).toBe('r-3');
    expect(result.status).toBe('DRAFT');
    expect(prisma.reports.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        author: 'admin',
        majorDefects: 2,
        minorDefects: 5,
        passRate: 95,
        status: 'draft',
        totalInspections: 100,
      }),
    });
  });

  it('throws INVALID_DATE when create body has invalid date', async () => {
    await expect(
      ReportRouteService.create({
        body: { date: 'not-a-date' },
        fallbackAuthor: 'admin',
      }),
    ).rejects.toThrow('INVALID_DATE');
  });

  it('uses fallbackAuthor when body author is empty', async () => {
    (prisma.reports.create as any).mockResolvedValue({
      author: 'fallback',
      date: new Date('2026-04-01'),
      id: 'r-4',
    });

    const result = await ReportRouteService.create({
      body: { date: '2026-04-01' },
      fallbackAuthor: 'fallback',
    });

    expect(result.author).toBe('fallback');
  });

  it('updates report fields by id', async () => {
    (prisma.reports.update as any).mockResolvedValue({
      date: new Date('2026-05-01'),
      id: 'r-5',
      status: 'PUBLISHED',
    });

    const result = await ReportRouteService.updateById('r-5', {
      status: 'published',
      totalInspections: '200',
    });

    expect(result.status).toBe('PUBLISHED');
    expect(prisma.reports.update).toHaveBeenCalledWith({
      where: { id: 'r-5' },
      data: expect.objectContaining({
        status: 'published',
        totalInspections: 200,
      }),
    });
  });

  it('throws INVALID_DATE when update body has invalid date', async () => {
    await expect(
      ReportRouteService.updateById('r-5', { date: 'bad-date' }),
    ).rejects.toThrow('INVALID_DATE');
  });

  it('saves daily summary via storage service', async () => {
    (
      VehicleCommissioningDailyReportStorageService.upsertDailySummary as any
    ).mockResolvedValue({
      date: new Date('2026-06-15'),
      reporter: 'Alice',
      summary: '{"summary":"test"}',
    });

    const result = await ReportRouteService.saveDailySummary({
      date: '2026-06-15',
      reporter: 'Alice',
      summary: 'test',
    });

    expect(result).toEqual({
      date: expect.any(String),
      documentItems: [],
      reporter: 'Alice',
      summary: 'test',
    });
    expect(
      VehicleCommissioningDailyReportStorageService.upsertDailySummary,
    ).toHaveBeenCalledWith({
      date: expect.any(Date),
      reporter: 'Alice',
      reportText: 'test',
      summary: JSON.stringify({ summary: 'test' }),
    });
  });

  it('throws INVALID_DATE when saving daily summary with bad date', async () => {
    await expect(
      ReportRouteService.saveDailySummary({
        date: 'invalid',
        reporter: 'Alice',
        summary: 'test',
      }),
    ).rejects.toThrow('INVALID_DATE');
  });

  it('delegates createDailyReport to storage service', async () => {
    const input = {
      date: new Date('2026-07-01'),
      reporter: 'Bob',
      summary: 'daily',
    };
    (
      VehicleCommissioningDailyReportStorageService.createDailyReport as any
    ).mockResolvedValue({
      id: 'dr-1',
    });

    const result = await ReportRouteService.createDailyReport(input);

    expect(result).toEqual({ id: 'dr-1' });
    expect(
      VehicleCommissioningDailyReportStorageService.createDailyReport,
    ).toHaveBeenCalledWith(input);
  });

  it('delegates findDailyReportById to storage service', async () => {
    (
      VehicleCommissioningDailyReportStorageService.findDailyReportById as any
    ).mockResolvedValue({
      id: 'dr-2',
    });

    const result = await ReportRouteService.findDailyReportById('dr-2');

    expect(result).toEqual({ id: 'dr-2' });
  });

  it('delegates countDailyReports to storage service', async () => {
    (
      VehicleCommissioningDailyReportStorageService.countDailyReports as any
    ).mockResolvedValue(3);

    const result = await ReportRouteService.countDailyReports({
      dateFrom: new Date('2026-01-01'),
    });

    expect(result).toBe(3);
    expect(
      VehicleCommissioningDailyReportStorageService.countDailyReports,
    ).toHaveBeenCalledWith({ dateFrom: new Date('2026-01-01') });
  });

  it('delegates findDailyReports to storage service', async () => {
    (
      VehicleCommissioningDailyReportStorageService.findDailyReports as any
    ).mockResolvedValue([{ id: 'dr-1' }]);

    const result = await ReportRouteService.findDailyReports({
      skip: 0,
      take: 10,
    });

    expect(result).toEqual([{ id: 'dr-1' }]);
    expect(
      VehicleCommissioningDailyReportStorageService.findDailyReports,
    ).toHaveBeenCalledWith({ skip: 0, take: 10 });
  });

  it('updates only provided fields in updateById', async () => {
    (prisma.reports.update as any).mockResolvedValue({
      date: new Date('2026-08-01'),
      id: 'r-6',
    });

    await ReportRouteService.updateById('r-6', { passRate: '88.5' });

    expect(prisma.reports.update).toHaveBeenCalledWith({
      where: { id: 'r-6' },
      data: { passRate: 88.5 },
    });
  });

  it('normalizes report status to uppercase in updateById', async () => {
    (prisma.reports.update as any).mockResolvedValue({
      date: new Date('2026-09-01'),
      id: 'r-7',
    });

    await ReportRouteService.updateById('r-7', { status: 'published' });

    expect(prisma.reports.update).toHaveBeenCalledWith({
      where: { id: 'r-7' },
      data: { status: 'published' },
    });
  });
});
