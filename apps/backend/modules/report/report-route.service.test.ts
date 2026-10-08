import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import { createEvent } from 'h3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import deleteReportHandler from '~/api/qms/reports/[id].delete';
import updateReportHandler from '~/api/qms/reports/[id].put';
import dailySummaryHandler from '~/api/qms/reports/daily-summary.put';
import createReportHandler from '~/api/qms/reports/index.post';
import { ReportRouteService } from '~/modules/report/report-route.service';
import { ReportWriteService } from '~/modules/report/report-write.service';
import { VehicleCommissioningDailyReportStorageService } from '~/modules/vehicle-commissioning/daily-report-storage.service';
import { BusinessError } from '~/utils/business-error';
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

vi.mock('~/modules/rbac', () => ({
  authorizeWrite: vi.fn().mockResolvedValue({ id: 'u-1' }),
}));
vi.mock('~/utils/api-logger', () => ({ logApiError: vi.fn() }));
vi.mock('~/utils/route-param', () => ({
  getRequiredRouterParam: vi.fn(() => 'report-1'),
}));
vi.mock('h3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('h3')>()),
  readBody: vi
    .fn()
    .mockResolvedValue({ date: '2026-10-08', summary: 'Summary' }),
  getRequestIP: vi.fn(),
  getRequestHeader: vi.fn(),
}));

function reportEvent() {
  const request = new IncomingMessage(new Socket());
  request.url = '/api/qms/reports';
  return createEvent(request, new ServerResponse(request));
}

const writeRoutes = [
  {
    name: 'update',
    handler: updateReportHandler,
    write: ReportWriteService.updateReport,
  },
  {
    name: 'delete',
    handler: deleteReportHandler,
    write: ReportWriteService.deleteReport,
  },
  {
    name: 'create',
    handler: createReportHandler,
    write: ReportWriteService.createReport,
  },
  {
    name: 'daily summary',
    handler: dailySummaryHandler,
    write: ReportWriteService.saveDailySummary,
  },
];
describe.each(writeRoutes)(
  'report $name route error responses',
  ({ handler, write }) => {
    beforeEach(() => vi.clearAllMocks());
    it.each([
      ['BAD_REQUEST', 400],
      ['FORBIDDEN', 403],
      ['CONFLICT', 409],
    ])('preserves %s and HTTP %i', async (code, httpStatus) => {
      vi.mocked(write).mockRejectedValueOnce(
        new BusinessError(code, 'Business failure', httpStatus),
      );
      const event = reportEvent();
      expect(await handler(event)).toMatchObject({
        code: -1,
        error: { code },
        message: 'Business failure',
      });
      expect(event.node.res.statusCode).toBe(httpStatus);
    });
    it('converts legacy business errors', async () => {
      vi.mocked(write).mockRejectedValueOnce(
        new Error('NOT_FOUND:Missing report'),
      );
      const event = reportEvent();
      expect(await handler(event)).toMatchObject({
        code: -1,
        error: { code: 'NOT_FOUND' },
        message: 'Missing report',
      });
      expect(event.node.res.statusCode).toBe(404);
    });
    it('returns HTTP 500 for unknown errors', async () => {
      vi.mocked(write).mockRejectedValueOnce(new Error('Database unavailable'));
      const event = reportEvent();
      await handler(event);
      expect(event.node.res.statusCode).toBe(500);
    });
  },
);
