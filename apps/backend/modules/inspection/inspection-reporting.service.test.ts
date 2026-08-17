import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionReportingService } from '~/modules/inspection/inspection-reporting.service';
import { QualityClassificationService } from '~/modules/quality-classification';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => {
  const qualityRecords = {
    aggregate: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    groupBy: vi.fn(),
    update: vi.fn(),
  };
  const transactionClient = {
    metric_refresh_jobs: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    quality_records: qualityRecords,
  };
  return {
    default: {
      $queryRaw: vi.fn(),
      $transaction: vi.fn((callback) => callback(transactionClient)),
      inspections: {
        count: vi.fn(),
        findMany: vi.fn(),
        groupBy: vi.fn(),
      },
      inspection_archive_tasks: {
        findMany: vi.fn(),
      },
      inspection_form_templates: {
        findMany: vi.fn(),
      },
      quality_records: qualityRecords,
    },
  };
});

vi.mock('~/modules/quality-loss/quality-loss-status', () => ({
  toQualityRecordStatus: vi.fn().mockReturnValue('OPEN'),
}));

vi.mock('~/utils/canonical-master-data', () => ({
  MasterDataGovernanceKernel: {
    resolveCanonicalNamesByIds: vi.fn().mockResolvedValue(new Map()),
  },
}));

vi.mock('~/modules/quality-classification', () => ({
  QualityClassificationService: {
    resolveCategoryNamesByIds: vi.fn().mockResolvedValue(new Map()),
  },
}));

describe('inspectionReportingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds as any
    ).mockResolvedValue(new Map());
    (
      QualityClassificationService.resolveCategoryNamesByIds as any
    ).mockResolvedValue(new Map());
    (prisma.quality_records.findUnique as any).mockResolvedValue(null);
    (prisma.quality_records.update as any).mockResolvedValue({
      supplierId: null,
    });
  });

  describe('findIssueIdBySerialNumber', () => {
    it('should return id when record exists', async () => {
      (prisma.quality_records.findFirst as any).mockResolvedValue({
        id: 'qr-1',
      });

      const result =
        await InspectionReportingService.findIssueIdBySerialNumber(12_345);

      expect(result).toBe('qr-1');
      expect(prisma.quality_records.findFirst).toHaveBeenCalledWith({
        where: { isDeleted: false, serialNumber: 12_345 },
        select: { id: true },
      });
    });

    it('should return null when no record exists', async () => {
      (prisma.quality_records.findFirst as any).mockResolvedValue(null);

      const result =
        await InspectionReportingService.findIssueIdBySerialNumber(99_999);

      expect(result).toBeNull();
    });
  });

  describe('updateQualityLossFields', () => {
    it('should update recoveredAmount only and ignore status', async () => {
      await InspectionReportingService.updateQualityLossFields({
        actualClaim: 500,
        id: 'qr-1',
      });

      expect(prisma.quality_records.update).toHaveBeenCalledWith({
        where: { id: 'qr-1' },
        data: expect.objectContaining({
          recoveredAmount: 500,
        }),
      });
      expect(prisma.quality_records.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: expect.anything() }),
        }),
      );
    });

    it('should skip status when not provided', async () => {
      await InspectionReportingService.updateQualityLossFields({
        id: 'qr-1',
      });

      const callData = (prisma.quality_records.update as any).mock.calls[0][0]
        .data;
      expect(callData).not.toHaveProperty('status');
    });
  });

  describe('getWorkspaceIssueSummary', () => {
    it('should return aggregated workspace data', async () => {
      (prisma.quality_records.findMany as any)
        .mockResolvedValueOnce([{ id: 'q1', status: 'OPEN' }])
        .mockResolvedValueOnce([{ id: 'q2', partName: 'Part' }]);
      (prisma.inspections.count as any).mockResolvedValue(5);
      (prisma.quality_records.count as any)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(2);

      const result = await InspectionReportingService.getWorkspaceIssueSummary({
        today: new Date('2024-06-01'),
      });

      expect(result.todayInspections).toBe(5);
      expect(result.todayIssues).toBe(3);
      expect(result.openIssuesCount).toBe(2);
      expect(result.openIssues).toHaveLength(1);
      expect(result.recentIssues).toHaveLength(1);
    });
  });

  describe('getSupplierScoringData', () => {
    it('should return supplier scoring data with supplierIds', async () => {
      (prisma.inspections.groupBy as any).mockResolvedValue([]);
      (prisma.quality_records.groupBy as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (prisma.quality_records.findMany as any).mockResolvedValue([]);

      const result = await InspectionReportingService.getSupplierScoringData({
        engineeringSupplierIds: ['s-1'],
        since: new Date('2024-01-01'),
        incomingSupplierIds: ['s-1'],
        processTeamIds: [],
      });

      expect(result).toHaveProperty('incomingStats');
      expect(result).toHaveProperty('engineeringStats');
      expect(result).toHaveProperty('engineeringStatusStats');
      expect(result).toHaveProperty('engineeringTotalStats');
      expect(result).toHaveProperty('records');
      expect(
        (prisma.quality_records.groupBy as any).mock.calls[0][0].by,
      ).toEqual(['supplierId']);
      expect(
        (prisma.quality_records.groupBy as any).mock.calls[1][0].by,
      ).toEqual(['supplierId', 'status']);
      expect(
        (prisma.quality_records.groupBy as any).mock.calls[2][0].by,
      ).toEqual(['supplierId']);
    });

    it('should not fall back to supplier names when IDs are empty', async () => {
      (prisma.inspections.groupBy as any).mockResolvedValue([]);
      (prisma.quality_records.groupBy as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (prisma.quality_records.findMany as any).mockResolvedValue([]);

      await InspectionReportingService.getSupplierScoringData({
        engineeringSupplierIds: [],
        since: new Date('2024-01-01'),
        incomingSupplierIds: [],
        processTeamIds: [],
      });

      expect(prisma.inspections.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [],
          }),
        }),
      );
      expect(prisma.quality_records.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ supplierId: { in: [] } }),
        }),
      );
    });

    it('should query resident outsourcing from process team records', async () => {
      (prisma.inspections.groupBy as any).mockResolvedValue([]);
      (prisma.quality_records.groupBy as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (prisma.quality_records.findMany as any).mockResolvedValue([]);

      await InspectionReportingService.getSupplierScoringData({
        engineeringSupplierIds: ['supplier-1'],
        since: new Date('2024-01-01'),
        incomingSupplierIds: [],
        processTeamIds: ['team-1'],
      });

      expect(prisma.inspections.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['category', 'supplierId', 'teamId', 'result'],
          where: expect.objectContaining({
            OR: [
              {
                category: 'PROCESS',
                teamId: { in: ['team-1'] },
              },
            ],
          }),
        }),
      );
    });
  });

  describe('getWeeklyReportIssues', () => {
    it('should return issues within date range', async () => {
      (prisma.quality_records.findMany as any).mockResolvedValue([
        { id: 'q1' },
      ]);

      const result = await InspectionReportingService.getWeeklyReportIssues({
        end: new Date('2024-06-07'),
        start: new Date('2024-06-01'),
      });

      expect(result).toHaveLength(1);
    });
  });

  describe('getDailyReportInspections', () => {
    it('should return inspections for user in date range', async () => {
      (prisma.inspections.findMany as any).mockResolvedValue([{ id: 'i1' }]);

      const result = await InspectionReportingService.getDailyReportInspections(
        {
          end: new Date('2024-06-01'),
          start: new Date('2024-06-01'),
          username: 'admin',
        },
      );

      expect(result).toHaveLength(1);
      expect(prisma.inspections.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ inspector: 'admin' }, { inspector: '' }],
          }),
          include: expect.any(Object),
        }),
      );
    });

    it('should include realName in OR filter when provided', async () => {
      (prisma.inspections.findMany as any).mockResolvedValue([]);

      await InspectionReportingService.getDailyReportInspections({
        end: new Date('2024-06-01'),
        realName: 'Admin User',
        start: new Date('2024-06-01'),
        username: 'admin',
      });

      const callWhere = (prisma.inspections.findMany as any).mock.calls[0][0]
        .where;
      expect(callWhere.OR).toEqual([
        { inspector: 'admin' },
        { inspector: 'Admin User' },
      ]);
    });
  });

  describe('getDailyReportIssues', () => {
    it('should return issues for user in date range', async () => {
      (prisma.quality_records.findMany as any).mockResolvedValue([
        { id: 'q1' },
      ]);

      const result = await InspectionReportingService.getDailyReportIssues({
        end: new Date('2024-06-01'),
        start: new Date('2024-06-01'),
        username: 'admin',
      });

      expect(result).toHaveLength(1);
    });
  });

  describe('getDailyArchiveReportData', () => {
    it('should return tasks and templates', async () => {
      (prisma.inspection_archive_tasks.findMany as any).mockResolvedValue([
        { id: 'at-1' },
      ]);
      (prisma.inspection_form_templates.findMany as any).mockResolvedValue([
        { id: 'ift-1' },
      ]);

      const result = await InspectionReportingService.getDailyArchiveReportData(
        {
          inspectionIds: ['i-1'],
          workOrderNumbers: ['WO-001'],
        },
      );

      expect(result.tasks).toHaveLength(1);
      expect(result.templates).toHaveLength(1);
    });

    it('should return empty arrays when no IDs provided', async () => {
      const result = await InspectionReportingService.getDailyArchiveReportData(
        {
          inspectionIds: [],
          workOrderNumbers: [],
        },
      );

      expect(result.tasks).toEqual([]);
      expect(result.templates).toEqual([]);
    });
  });

  describe('getReportPeriodMetrics', () => {
    it('should return new/closed issues and internal loss', async () => {
      (prisma.quality_records.count as any)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(3);
      (prisma.quality_records.aggregate as any).mockResolvedValue({
        _sum: { lossAmount: 500 },
      });

      const result = await InspectionReportingService.getReportPeriodMetrics({
        end: new Date('2024-06-30'),
        start: new Date('2024-06-01'),
      });

      expect(result).toEqual({
        closedIssues: 3,
        internalLoss: 500,
        newIssues: 10,
      });
    });

    it('should default internalLoss to 0 when null', async () => {
      (prisma.quality_records.count as any)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      (prisma.quality_records.aggregate as any).mockResolvedValue({
        _sum: { lossAmount: null },
      });

      const result = await InspectionReportingService.getReportPeriodMetrics({
        end: new Date('2024-06-30'),
        start: new Date('2024-06-01'),
      });

      expect(result.internalLoss).toBe(0);
    });
  });

  describe('getReportDefectRows', () => {
    it('should return defect type rows', async () => {
      (prisma.quality_records.findMany as any).mockResolvedValue([
        { defectType: 'A', defectCategoryId: 'dt-1' },
      ]);

      const result = await InspectionReportingService.getReportDefectRows({
        end: new Date('2024-06-30'),
        start: new Date('2024-06-01'),
      });

      expect(result).toHaveLength(1);
    });
  });

  describe('getReportTopRiskProjects', () => {
    it('should return top 5 risk projects', async () => {
      (prisma.quality_records.groupBy as any).mockResolvedValue([
        {
          projectId: 'project-1',
          projectName: 'Old P1',
          _count: 3,
          _sum: { lossAmount: 700 },
        },
        {
          projectId: 'project-1',
          projectName: 'Renamed P1',
          _count: 2,
          _sum: { lossAmount: 300 },
        },
        {
          projectId: null,
          projectName: 'Legacy Project',
          _count: 1,
          _sum: { lossAmount: 200 },
        },
      ]);
      (
        MasterDataGovernanceKernel.resolveCanonicalNamesByIds as any
      ).mockResolvedValue(new Map([['project-1', 'P1']]));

      const result = await InspectionReportingService.getReportTopRiskProjects({
        end: new Date('2024-06-30'),
        start: new Date('2024-06-01'),
      });

      expect(result).toHaveLength(2);
      expect(result[0].projectName).toBe('P1');
      expect(result[0]._count).toBe(5);
      expect(result[1].projectName).toBe('数据待治理：Legacy Project');
      expect(prisma.quality_records.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ by: ['projectId', 'projectName'] }),
      );
    });
  });

  describe('getReportSupplierPerformance', () => {
    it('should return supplier performance grouped data', async () => {
      (prisma.quality_records.groupBy as any).mockResolvedValue([
        {
          supplierId: 'supplier-1',
          supplierName: 'Old Supplier',
          _count: 3,
        },
        {
          supplierId: null,
          supplierName: 'Legacy Supplier',
          _count: 2,
        },
      ]);
      (
        MasterDataGovernanceKernel.resolveCanonicalNamesByIds as any
      ).mockResolvedValue(new Map([['supplier-1', 'Supplier A']]));

      const result =
        await InspectionReportingService.getReportSupplierPerformance({
          end: new Date('2024-06-30'),
          start: new Date('2024-06-01'),
        });

      expect(result).toHaveLength(2);
      expect(result[0].supplierName).toBe('Supplier A');
      expect(result[1].supplierName).toBe('数据待治理：Legacy Supplier');
      expect(prisma.quality_records.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['supplierId', 'supplierName'],
          where: expect.objectContaining({ supplierName: { not: null } }),
        }),
      );
    });
  });

  describe('getReportMajorEvents', () => {
    it('should return top 3 major events', async () => {
      (prisma.quality_records.findMany as any).mockResolvedValue([
        { id: 'q1', lossAmount: 5000 },
      ]);

      const result = await InspectionReportingService.getReportMajorEvents({
        end: new Date('2024-06-30'),
        start: new Date('2024-06-01'),
      });

      expect(result).toHaveLength(1);
      expect(prisma.quality_records.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 3 }),
      );
    });
  });

  describe('getWelderScoreStats', () => {
    it('should return groupBy stats with responsible welder and severity', async () => {
      (prisma.quality_records.groupBy as any).mockResolvedValue([
        {
          responsibleWelder: 'Welder A',
          responsibleWelderId: 'welder-1',
          severity: 'major',
          _count: { id: 3 },
        },
      ]);

      const result = await InspectionReportingService.getWelderScoreStats();

      expect(result).toHaveLength(1);
      expect(result[0].responsibleWelder).toBe('Welder A');
      expect(result[0].responsibleWelderId).toBe('welder-1');
      expect(result[0]._count.id).toBe(3);
      expect(prisma.quality_records.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['responsibleWelderId', 'responsibleWelder', 'severity'],
          where: expect.objectContaining({
            isDeleted: false,
          }),
          _count: { id: true },
        }),
      );
    });

    it('filters by welder ids and legacy names when requested', async () => {
      (prisma.quality_records.groupBy as any).mockResolvedValue([]);

      await InspectionReportingService.getWelderScoreStats({
        welderIds: ['welder-1'],
        welderNames: ['Welder A'],
      });

      expect(prisma.quality_records.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { responsibleWelderId: { in: ['welder-1'] } },
              {
                responsibleWelder: { in: ['Welder A'] },
                responsibleWelderId: null,
              },
            ],
          }),
        }),
      );
    });
  });

  describe('getWorkOrderAggregateInspections', () => {
    it('should return inspections for work order', async () => {
      (prisma.inspections.findMany as any).mockResolvedValue([
        { id: 'i1', workOrderNumber: 'WO-001' },
      ]);

      const result =
        await InspectionReportingService.getWorkOrderAggregateInspections(
          'WO-001',
        );

      expect(result).toHaveLength(1);
      expect(prisma.inspections.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workOrderNumber: 'WO-001' }),
          include: expect.any(Object),
        }),
      );
    });
  });

  describe('getStatsForDashboard', () => {
    it('should return dashboard stats', async () => {
      (prisma.quality_records.aggregate as any)
        .mockResolvedValueOnce({
          _count: { id: 50 },
          _sum: { lossAmount: 5000 },
        })
        .mockResolvedValueOnce({
          _sum: { lossAmount: 800 },
        });
      (prisma.quality_records.count as any).mockResolvedValue(8);
      (prisma.quality_records.groupBy as any).mockResolvedValue([
        {
          defectCategoryId: 'defect-a',
          defectType: 'Old A',
          _count: { id: 2 },
        },
        {
          defectCategoryId: 'defect-a',
          defectType: 'Renamed A',
          _count: { id: 1 },
        },
        {
          defectCategoryId: null,
          defectType: 'Legacy Defect',
          _count: { id: 1 },
        },
      ]);
      (
        QualityClassificationService.resolveCategoryNamesByIds as any
      ).mockResolvedValue(new Map([['defect-a', 'A']]));

      const result = await InspectionReportingService.getStatsForDashboard({
        weekStart: new Date('2024-06-01'),
        yearStart: new Date('2024-01-01'),
      });

      expect(result.totalCount).toBe(50);
      expect(result.weeklyCount).toBe(8);
      expect(result.totalLoss).toBe(5000);
      expect(result.weeklyLoss).toBe(800);
      expect(result.issueDistribution).toContainEqual({
        type: 'A',
        value: 3,
      });
      expect(result.issueDistribution).toContainEqual({
        type: '数据待治理：Legacy Defect',
        value: 1,
      });
    });
  });
});
