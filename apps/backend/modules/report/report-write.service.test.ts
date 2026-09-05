import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { VehicleCommissioningDailyReportStorageService } from '~/modules/vehicle-commissioning/daily-report-storage.service';
import prisma from '~/utils/prisma';

import { ReportWriteService } from './report-write.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    reports: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: { auditLog: vi.fn().mockResolvedValue({}) },
}));

vi.mock('~/modules/vehicle-commissioning/daily-report-storage.service', () => ({
  VehicleCommissioningDailyReportStorageService: {
    upsertDailySummary: vi.fn(),
  },
}));

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    realName: 'Alice',
    roles: ['quality'],
    username: 'alice',
    ...overrides,
  } as any;
}

const adminUser = makeUser({ roles: ['admin'] });

function mockCurrentReport(overrides: Record<string, unknown> = {}) {
  vi.mocked(prisma.reports.findUnique).mockResolvedValue({
    author: 'Alice',
    date: new Date('2026-06-01'),
    id: 'report-a',
    passRate: 90,
    status: 'Draft',
    totalInspections: 50,
    ...overrides,
  } as any);
}

describe('reportWriteService (SEC-REPORT-WRITE-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateReport', () => {
    it('rejects updating another author report (object authorization)', async () => {
      mockCurrentReport({ author: 'Bob' });

      await expect(
        ReportWriteService.updateReport({
          body: { totalInspections: 10 },
          id: 'report-b',
          userinfo: makeUser(),
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(prisma.reports.updateMany).not.toHaveBeenCalled();
    });

    it('allows the report owner to update their own report and audits', async () => {
      mockCurrentReport();
      vi.mocked(prisma.reports.updateMany).mockResolvedValue({ count: 1 });

      const result = await ReportWriteService.updateReport({
        body: { passRate: 90, totalInspections: 50 },
        id: 'report-a',
        userinfo: makeUser(),
      });

      expect(result.passRate).toBe(90);
      expect(prisma.reports.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'report-a',
          status: 'Draft',
          OR: [{ author: 'Alice' }, { author: 'alice' }],
        },
        data: { passRate: 90, totalInspections: 50 },
      });
      expect(SystemLogService.auditLog).toHaveBeenCalledWith(
        'report',
        'update',
        expect.objectContaining({ targetId: 'report-a', userId: '1' }),
      );
    });

    it('allows system admin to update any report', async () => {
      mockCurrentReport({ author: 'Bob', id: 'report-b' });
      vi.mocked(prisma.reports.updateMany).mockResolvedValue({ count: 1 });

      const result = await ReportWriteService.updateReport({
        body: { totalInspections: 1 },
        id: 'report-b',
        userinfo: adminUser,
      });

      expect(result.id).toBe('report-b');
      expect(prisma.reports.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'report-b', status: 'Draft' },
        }),
      );
    });

    it('rejects illegal status jump Published -> Draft with 409', async () => {
      mockCurrentReport({ status: 'Published' });

      await expect(
        ReportWriteService.updateReport({
          body: { status: 'Draft' },
          id: 'report-a',
          userinfo: makeUser(),
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(prisma.reports.updateMany).not.toHaveBeenCalled();
    });

    it('allows Draft -> Published and Draft -> Archived transitions', async () => {
      for (const status of ['Published', 'Archived']) {
        mockCurrentReport();
        vi.mocked(prisma.reports.updateMany).mockResolvedValue({ count: 1 });

        await ReportWriteService.updateReport({
          body: { status },
          id: 'report-a',
          userinfo: makeUser(),
        });

        expect(prisma.reports.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({ data: { status } }),
        );
      }
    });

    it('returns 409 when the CAS status check fails', async () => {
      mockCurrentReport();
      vi.mocked(prisma.reports.updateMany).mockResolvedValue({ count: 0 });

      await expect(
        ReportWriteService.updateReport({
          body: { totalInspections: 10 },
          id: 'report-a',
          userinfo: makeUser(),
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('forbids changing the author through the update body', async () => {
      mockCurrentReport();

      await expect(
        ReportWriteService.updateReport({
          body: { author: 'Mallory' },
          id: 'report-a',
          userinfo: makeUser(),
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('returns 404 when the report does not exist', async () => {
      vi.mocked(prisma.reports.findUnique).mockResolvedValue(null);

      await expect(
        ReportWriteService.updateReport({
          body: {},
          id: 'missing',
          userinfo: makeUser(),
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('deleteReport', () => {
    it('rejects deleting another author report', async () => {
      mockCurrentReport({ author: 'Bob' });

      await expect(
        ReportWriteService.deleteReport({
          id: 'report-b',
          userinfo: makeUser(),
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(prisma.reports.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes an owned Draft report and audits', async () => {
      mockCurrentReport();
      vi.mocked(prisma.reports.deleteMany).mockResolvedValue({ count: 1 });

      const result = await ReportWriteService.deleteReport({
        id: 'report-a',
        userinfo: makeUser(),
      });

      expect(result).toEqual({ message: 'Deleted' });
      expect(prisma.reports.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'report-a',
          status: 'Draft',
          OR: [{ author: 'Alice' }, { author: 'alice' }],
        },
      });
      expect(SystemLogService.auditLog).toHaveBeenCalledWith(
        'report',
        'delete',
        expect.objectContaining({ targetId: 'report-a' }),
      );
    });

    it('blocks deleting a Published report with 409', async () => {
      mockCurrentReport({ status: 'Published' });

      await expect(
        ReportWriteService.deleteReport({
          id: 'report-a',
          userinfo: makeUser(),
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(prisma.reports.deleteMany).not.toHaveBeenCalled();
    });

    it('returns 409 when the CAS delete finds no matching row', async () => {
      mockCurrentReport();
      vi.mocked(prisma.reports.deleteMany).mockResolvedValue({ count: 0 });

      await expect(
        ReportWriteService.deleteReport({
          id: 'report-a',
          userinfo: makeUser(),
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });

  describe('createReport', () => {
    it('creates a Draft report authored by the current user and audits', async () => {
      vi.mocked(prisma.reports.create).mockResolvedValue({
        author: 'Alice',
        date: new Date('2026-03-01'),
        id: 'report-new',
        status: 'Draft',
      } as any);

      const result = await ReportWriteService.createReport({
        body: {
          author: 'Mallory',
          date: '2026-03-01',
          status: 'draft',
        },
        userinfo: makeUser(),
      });

      expect(result.author).toBe('Alice');
      expect(prisma.reports.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          author: 'Alice',
          status: 'Draft',
        }),
      });
      expect(SystemLogService.auditLog).toHaveBeenCalledWith(
        'report',
        'create',
        expect.objectContaining({ targetId: 'report-new' }),
      );
    });

    it('rejects creating a report directly as Published', async () => {
      await expect(
        ReportWriteService.createReport({
          body: { date: '2026-03-01', status: 'Published' },
          userinfo: makeUser(),
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(prisma.reports.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid date', async () => {
      await expect(
        ReportWriteService.createReport({
          body: { date: 'not-a-date' },
          userinfo: makeUser(),
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });
  });

  describe('saveDailySummary', () => {
    it('always uses the authenticated user as reporter and audits', async () => {
      vi.mocked(
        VehicleCommissioningDailyReportStorageService.upsertDailySummary,
      ).mockResolvedValue({
        date: new Date('2026-06-15'),
        reporter: 'alice',
      } as any);

      const result = await ReportWriteService.saveDailySummary({
        date: '2026-06-15',
        summary: 'test',
        userinfo: makeUser(),
      });

      expect(result.reporter).toBe('alice');
      expect(
        VehicleCommissioningDailyReportStorageService.upsertDailySummary,
      ).toHaveBeenCalledWith({
        date: expect.any(Date),
        reporter: 'alice',
        reportText: 'test',
        summary: JSON.stringify({ summary: 'test' }),
      });
      expect(SystemLogService.auditLog).toHaveBeenCalledWith(
        'report',
        'daily-summary',
        expect.objectContaining({ userId: '1' }),
      );
    });

    it('rejects an invalid date', async () => {
      await expect(
        ReportWriteService.saveDailySummary({
          date: 'invalid',
          summary: 'test',
          userinfo: makeUser(),
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });
  });
});
