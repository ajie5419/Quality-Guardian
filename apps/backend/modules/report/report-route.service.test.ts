import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportRouteService } from '~/modules/report/report-route.service';
import { ReportWriteService } from '~/modules/report/report-write.service';
import { VehicleCommissioningDailyReportStorageService } from '~/modules/vehicle-commissioning/daily-report-storage.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    reports: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('~/modules/report/report-write.service', () => ({
  buildReportOwnershipWhere: vi.fn(
    (userinfo: { realName?: string; username?: string }) => ({
      OR: [
        ...(userinfo.realName ? [{ author: userinfo.realName }] : []),
        ...(userinfo.username ? [{ author: userinfo.username }] : []),
      ],
    }),
  ),
  ReportWriteService: {
    createReport: vi.fn(),
    deleteReport: vi.fn(),
    saveDailySummary: vi.fn(),
    updateReport: vi.fn(),
  },
}));

vi.mock('~/modules/vehicle-commissioning/daily-report-storage.service', () => ({
  VehicleCommissioningDailyReportStorageService: {
    countDailyReports: vi.fn(),
    createDailyReport: vi.fn(),
    findDailyReportById: vi.fn(),
    findDailyReports: vi.fn(),
  },
}));

const userinfo = {
  id: 1,
  realName: 'Alice',
  roles: ['quality'],
  username: 'alice',
} as any;

describe('reportRouteService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns list of reports ordered by date desc', async () => {
    (prisma.reports.findMany as any).mockResolvedValue([
      { date: new Date('2026-01-10'), id: 'r-2' },
      { date: new Date('2026-01-01'), id: 'r-1' },
    ]);

    const result = await ReportRouteService.getList(userinfo);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('r-2');
    expect(prisma.reports.findMany).toHaveBeenCalledWith({
      orderBy: { date: 'desc' },
      where: { OR: [{ author: 'Alice' }, { author: 'alice' }] },
    });
  });

  it('delegates deleteById to ReportWriteService', async () => {
    (ReportWriteService.deleteReport as any).mockResolvedValue({
      message: 'Deleted',
    });

    const result = await ReportRouteService.deleteById('r-1', userinfo);

    expect(result).toEqual({ message: 'Deleted' });
    expect(ReportWriteService.deleteReport).toHaveBeenCalledWith({
      audit: undefined,
      id: 'r-1',
      userinfo,
    });
  });

  it('delegates updateById to ReportWriteService', async () => {
    (ReportWriteService.updateReport as any).mockResolvedValue({
      date: new Date('2026-05-01'),
      id: 'r-5',
      status: 'Published',
    });

    const result = await ReportRouteService.updateById(
      'r-5',
      { status: 'Published' },
      userinfo,
    );

    expect(result.status).toBe('Published');
    expect(ReportWriteService.updateReport).toHaveBeenCalledWith({
      audit: undefined,
      body: { status: 'Published' },
      id: 'r-5',
      userinfo,
    });
  });

  it('delegates create to ReportWriteService', async () => {
    (ReportWriteService.createReport as any).mockResolvedValue({
      author: 'Alice',
      date: new Date('2026-03-01'),
      id: 'r-3',
    });

    const result = await ReportRouteService.create({
      body: { date: '2026-03-01' },
      userinfo,
    });

    expect(result.id).toBe('r-3');
    expect(ReportWriteService.createReport).toHaveBeenCalledWith({
      audit: undefined,
      body: { date: '2026-03-01' },
      userinfo,
    });
  });

  it('delegates saveDailySummary to ReportWriteService', async () => {
    (ReportWriteService.saveDailySummary as any).mockResolvedValue({
      date: '2026-06-15',
      documentItems: [],
      reporter: 'Alice',
      summary: 'test',
    });

    const result = await ReportRouteService.saveDailySummary({
      date: '2026-06-15',
      summary: 'test',
      userinfo,
    });

    expect(result.reporter).toBe('Alice');
    expect(ReportWriteService.saveDailySummary).toHaveBeenCalledWith({
      audit: undefined,
      date: '2026-06-15',
      summary: 'test',
      userinfo,
    });
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
});
