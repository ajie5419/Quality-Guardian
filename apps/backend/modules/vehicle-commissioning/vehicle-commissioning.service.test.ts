import { Buffer } from 'node:buffer';

import { VEHICLE_COMMISSIONING_PERMISSION_CODES } from '@qgs/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { RbacService } from '~/modules/rbac/rbac.service';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import {
  getVehicleCommissioningSeverityLabel,
  getVehicleCommissioningSeverityRank,
  getVehicleCommissioningStatusLabel,
  normalizeVehicleCommissioningPhotos,
  parseVehicleCommissioningIssueStatus,
} from '~/modules/vehicle-commissioning/vehicle-commissioning-issue-format';
import { VehicleCommissioningService } from '~/modules/vehicle-commissioning/vehicle-commissioning.service';
import prisma from '~/utils/prisma';

const mocks = vi.hoisted(() => ({ enqueue: vi.fn() }));

vi.mock('nanoid', () => ({
  nanoid: () => 'issueid1',
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    vehicle_commissioning_issues: {
      aggregate: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    quality_loss_index_jobs: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock('~/utils/governed-write', () => ({
  buildGovernedWriteFieldsForTable: () => ({
    responsibleDepartmentId: 'dept-1',
  }),
}));

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    registerReferencesFromAttachments: vi.fn(),
    softDeleteReferences: vi.fn(),
  },
}));

vi.mock('~/modules/quality-loss', () => ({
  QualityLossIndexQueue: { enqueue: mocks.enqueue },
}));

vi.mock('~/modules/rbac/rbac.service', () => ({
  RbacService: {
    getUserPermissionCodes: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: {
    auditLog: vi.fn(),
    getAuditLogsByTarget: vi.fn(),
  },
}));

vi.mock(
  '~/modules/vehicle-commissioning/vehicle-commissioning-daily-report.service',
  () => ({
    VehicleCommissioningDailyReportService: {
      createDailyReport: vi.fn(),
      getDailyReportPreview: vi.fn(),
      getDailyReports: vi.fn(),
    },
  }),
);

vi.mock(
  '~/modules/vehicle-commissioning/vehicle-commissioning-export.service',
  () => ({
    exportVehicleCommissioningIssuesWorkbook: vi.fn(),
  }),
);

const createdRow = {
  claimNotes: null,
  claimStatus: 'OPEN',
  closedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  createdBy: 'user-1',
  date: new Date('2026-01-01T00:00:00.000Z'),
  description: 'Brake issue',
  id: 'DA-2026-ISSUEID1',
  isClaim: true,
  issuePhoto: '["/a.png"]',
  lossAmount: 120,
  partName: 'Brake',
  projectName: 'Project A',
  recoveredAmount: 30,
  responsibleDepartment: 'Debug',
  severity: 'major',
  solution: null,
  status: 'OPEN',
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  workOrderNumber: 'WO-1',
};

describe('vehicleCommissioningService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) =>
      callback({
        vehicle_commissioning_issues: prisma.vehicle_commissioning_issues,
        quality_loss_index_jobs: prisma.quality_loss_index_jobs,
      }),
    );
  });

  it('finds issue id by primary id', async () => {
    vi.mocked(prisma.vehicle_commissioning_issues.findFirst).mockResolvedValue({
      id: 'issue-1',
    } as never);

    await expect(
      VehicleCommissioningService.findIssueId('issue-1'),
    ).resolves.toBe('issue-1');
    expect(prisma.vehicle_commissioning_issues.findFirst).toHaveBeenCalledWith({
      where: { id: 'issue-1', isDeleted: false },
      select: { id: true },
    });
  });

  it('updates quality loss fields with only provided values', async () => {
    vi.mocked(prisma.vehicle_commissioning_issues.update).mockResolvedValue({
      id: 'issue-1',
    } as never);

    await VehicleCommissioningService.updateQualityLossFields({
      actualClaim: 20,
      id: 'issue-1',
    });

    expect(prisma.vehicle_commissioning_issues.update).toHaveBeenCalledWith({
      where: { id: 'issue-1' },
      data: expect.objectContaining({
        recoveredAmount: 20,
        updatedAt: expect.any(Date),
      }),
    });
    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicle_commissioning_issues: prisma.vehicle_commissioning_issues,
      }),
      [{ source: 'COMMISSIONING', sourcePk: 'issue-1' }],
      'vehicle-commissioning.quality-loss-updated',
    );
  });

  it('queries quality loss dashboard stats', async () => {
    vi.mocked(prisma.vehicle_commissioning_issues.findMany).mockResolvedValue([
      createdRow,
    ] as never);
    vi.mocked(prisma.vehicle_commissioning_issues.aggregate)
      .mockResolvedValueOnce({
        _count: { id: 3 },
        _sum: { lossAmount: 300 },
      } as never)
      .mockResolvedValueOnce({
        _sum: { lossAmount: 50 },
      } as never);
    vi.mocked(prisma.vehicle_commissioning_issues.count).mockResolvedValue(
      2 as never,
    );

    const stats = await VehicleCommissioningService.getStatsForDashboard({
      weekStart: new Date('2026-01-01T00:00:00.000Z'),
      yearStart: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(stats).toEqual({
      totalCount: 3,
      totalLoss: 300,
      weeklyCount: 2,
      weeklyLoss: 50,
    });
  });

  it('creates issue from body, registers photo references, and writes audit log', async () => {
    const { FileStorageService } = await import(
      '~/modules/file-storage/file-storage.service'
    );
    const { SystemLogService } = await import(
      '~/modules/system-log/system-log.service'
    );
    vi.mocked(prisma.vehicle_commissioning_issues.create).mockResolvedValue(
      createdRow as never,
    );

    const result = await VehicleCommissioningService.createIssueFromBody(
      {
        description: 'Brake issue',
        isClaim: 'true',
        lossAmount: '120',
        partName: 'Brake',
        photos: ['/a.png'],
        recoveredAmount: '30',
        responsibleDepartment: 'Debug',
        severity: 'major',
        workOrderNumber: 'WO-1',
      },
      'user-1',
    );

    expect(result).toEqual(expect.objectContaining({ id: 'DA-2026-ISSUEID1' }));
    expect(prisma.vehicle_commissioning_issues.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdBy: 'user-1',
        description: 'Brake issue',
        isClaim: true,
        issuePhoto: '["/a.png"]',
        lossAmount: 120,
        recoveredAmount: 30,
        responsibleDepartmentId: 'dept-1',
        workOrderNumber: 'WO-1',
      }),
    });
    expect(
      FileStorageService.registerReferencesFromAttachments,
    ).toHaveBeenCalledWith({
      attachments: ['/a.png'],
      bizId: 'DA-2026-ISSUEID1',
      bizType: 'vehicle_commissioning_issue',
      fieldName: 'photos',
    });
    expect(SystemLogService.auditLog).toHaveBeenCalledWith(
      'vehicle-commissioning',
      'issueCreate',
      expect.objectContaining({
        targetId: 'DA-2026-ISSUEID1',
        userId: 'user-1',
      }),
    );
  });

  it('queries paged issues with normalized filters', async () => {
    vi.mocked(prisma.vehicle_commissioning_issues.findMany).mockResolvedValue([
      createdRow,
    ] as never);
    vi.mocked(prisma.vehicle_commissioning_issues.count).mockResolvedValue(
      1 as never,
    );

    const result = await VehicleCommissioningService.getIssues({
      date: '2026-01-01',
      page: 2,
      pageSize: 5,
      projectName: ' Project ',
      status: 'CLOSED',
      workOrderNumber: ' WO ',
    });

    expect(result.total).toBe(1);
    expect(prisma.vehicle_commissioning_issues.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { date: 'desc' },
        skip: 5,
        take: 5,
        where: expect.objectContaining({
          isDeleted: false,
          projectName: { contains: 'Project' },
          workOrderNumber: { contains: 'WO' },
        }),
      }),
    );
  });

  it('delegates daily reports, previews, and workbook export', async () => {
    const { VehicleCommissioningDailyReportService } = await import(
      '~/modules/vehicle-commissioning/vehicle-commissioning-daily-report.service'
    );
    const { exportVehicleCommissioningIssuesWorkbook } = await import(
      '~/modules/vehicle-commissioning/vehicle-commissioning-export.service'
    );
    vi.mocked(
      VehicleCommissioningDailyReportService.createDailyReport,
    ).mockResolvedValue({ id: 'report-1' } as never);
    vi.mocked(
      VehicleCommissioningDailyReportService.getDailyReports,
    ).mockResolvedValue({ items: [], total: 0 } as never);
    vi.mocked(
      VehicleCommissioningDailyReportService.getDailyReportPreview,
    ).mockResolvedValue({ id: 'report-1' } as never);
    vi.mocked(exportVehicleCommissioningIssuesWorkbook).mockResolvedValue(
      Buffer.from('xlsx') as never,
    );

    await VehicleCommissioningService.createDailyReport({
      date: '2026-01-01',
      mainWorks: [],
      projectName: 'Project',
      reporters: [],
    });
    await VehicleCommissioningService.getDailyReports({ page: 1 });
    await VehicleCommissioningService.getDailyReportPreview('report-1');
    await VehicleCommissioningService.exportIssuesWorkbook({});

    expect(
      VehicleCommissioningDailyReportService.createDailyReport,
    ).toHaveBeenCalled();
    expect(
      VehicleCommissioningDailyReportService.getDailyReports,
    ).toHaveBeenCalledWith({
      page: 1,
    });
    expect(
      VehicleCommissioningDailyReportService.getDailyReportPreview,
    ).toHaveBeenCalledWith('report-1');
    expect(exportVehicleCommissioningIssuesWorkbook).toHaveBeenCalledWith(
      VehicleCommissioningService,
      {},
    );
  });

  it('maps issue logs to display operator fallback chain', async () => {
    const { SystemLogService } = await import(
      '~/modules/system-log/system-log.service'
    );
    vi.mocked(SystemLogService.getAuditLogsByTarget).mockResolvedValue([
      {
        action: 'issueUpdate',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        details: 'details',
        id: 'log-1',
        userId: 'user-1',
        users: { realName: '', username: 'operator' },
      },
    ] as never);

    const result = await VehicleCommissioningService.getIssueLogs('issue-1');

    expect(result).toEqual([
      {
        action: 'issueUpdate',
        createdAt: '2026-01-01T00:00:00.000Z',
        details: 'details',
        id: 'log-1',
        operator: 'operator',
      },
    ]);
  });

  it('rejects issue deletion without the delete permission', async () => {
    vi.mocked(RbacService.getUserPermissionCodes).mockResolvedValue([]);

    await expect(
      VehicleCommissioningService.deleteIssue('issue-1', {
        id: 'user-1',
        realName: 'Operator',
        roles: [],
        username: 'operator',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', httpStatus: 403 });
    expect(
      prisma.vehicle_commissioning_issues.findFirst,
    ).not.toHaveBeenCalled();
  });

  it('soft deletes an issue and its dependent index and file references', async () => {
    vi.mocked(RbacService.getUserPermissionCodes).mockResolvedValue([
      VEHICLE_COMMISSIONING_PERMISSION_CODES.DELETE,
    ]);
    vi.mocked(prisma.vehicle_commissioning_issues.findFirst).mockResolvedValue({
      description: 'Brake issue',
      id: 'issue-1',
    } as never);
    vi.mocked(prisma.vehicle_commissioning_issues.updateMany).mockResolvedValue(
      {
        count: 1,
      } as never,
    );

    await VehicleCommissioningService.deleteIssue('issue-1', {
      id: 'user-1',
      realName: 'Operator',
      roles: [],
      username: 'operator',
    });

    expect(prisma.vehicle_commissioning_issues.updateMany).toHaveBeenCalledWith(
      {
        where: { id: 'issue-1', isDeleted: false },
        data: { isDeleted: true, updatedAt: expect.any(Date) },
      },
    );
    expect(FileStorageService.softDeleteReferences).toHaveBeenCalledWith({
      bizId: 'issue-1',
      bizType: 'vehicle_commissioning_issue',
    });
    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicle_commissioning_issues: prisma.vehicle_commissioning_issues,
      }),
      [{ source: 'COMMISSIONING', sourcePk: 'issue-1' }],
      'vehicle-commissioning.deleted',
    );
    expect(SystemLogService.auditLog).toHaveBeenCalledWith(
      'vehicle-commissioning',
      'issueDelete',
      expect.objectContaining({
        detailsVariables: { issue: 'Brake issue' },
        targetId: 'issue-1',
        userId: 'user-1',
      }),
    );
  });

  it('updates issue and registers changed photos from body', async () => {
    const { FileStorageService } = await import(
      '~/modules/file-storage/file-storage.service'
    );
    const { SystemLogService } = await import(
      '~/modules/system-log/system-log.service'
    );
    vi.mocked(prisma.vehicle_commissioning_issues.update).mockResolvedValue({
      ...createdRow,
      id: 'issue-1',
      issuePhoto: '["/b.png"]',
      status: 'CLOSED',
    } as never);

    const result = await VehicleCommissioningService.updateIssueFromBody(
      'issue-1',
      {
        photos: ['/b.png'],
        status: 'CLOSED',
      },
      'user-1',
    );

    expect(result).toEqual(expect.objectContaining({ id: 'issue-1' }));
    expect(prisma.vehicle_commissioning_issues.update).toHaveBeenCalledWith({
      where: { id: 'issue-1' },
      data: expect.objectContaining({
        closedAt: expect.any(Date),
        issuePhoto: '["/b.png"]',
        status: 'CLOSED',
      }),
    });
    expect(SystemLogService.auditLog).toHaveBeenCalledWith(
      'vehicle-commissioning',
      'issueUpdate',
      expect.objectContaining({ targetId: 'issue-1', userId: 'user-1' }),
    );
    expect(
      FileStorageService.registerReferencesFromAttachments,
    ).toHaveBeenCalledWith({
      attachments: ['/b.png'],
      bizId: 'issue-1',
      bizType: 'vehicle_commissioning_issue',
      fieldName: 'photos',
    });
  });

  it('normalizes vehicle commissioning issue formatting helpers', () => {
    expect(parseVehicleCommissioningIssueStatus('CLOSED')).toBe('CLOSED');
    expect(normalizeVehicleCommissioningPhotos(['/a.png', ''])).toBe(
      '["/a.png"]',
    );
    expect(getVehicleCommissioningSeverityLabel('major')).toBe('一般');
    expect(getVehicleCommissioningSeverityRank('critical')).toBeGreaterThan(
      getVehicleCommissioningSeverityRank('minor'),
    );
    expect(getVehicleCommissioningStatusLabel('IN_PROGRESS')).toBe('处理中');
  });
});
