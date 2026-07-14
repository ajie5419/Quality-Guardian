import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionIssueListService } from '~/modules/inspection/inspection-issue-list.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    quality_records: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock('~/modules/dept/dept-tree', () => ({
  findDeptSubtree: vi.fn().mockReturnValue([]),
}));

vi.mock('~/modules/dept/dept.service', () => ({
  DeptService: {
    findAll: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('~/modules/quality-loss/quality-loss-status', () => ({
  toQualityRecordStatus: vi.fn((v) => v),
}));

vi.mock('~/utils/process-resolver', () => ({
  buildProcessNameWhere: vi.fn().mockResolvedValue({}),
  resolveCanonicalProcessName: vi.fn().mockReturnValue(null),
}));

vi.mock('~/utils/department-multi', () => ({
  parseResponsibleDepartments: vi.fn().mockReturnValue([]),
}));

describe('inspectionIssueListService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findSupplierIssues', () => {
    it('finds engineering issues by canonical supplier ID', async () => {
      vi.mocked(prisma.quality_records.count).mockResolvedValue(0);
      vi.mocked(prisma.quality_records.findMany).mockResolvedValue([]);

      await InspectionIssueListService.findSupplierIssues({
        page: 2,
        pageSize: 5,
        supplierId: 'supplier-1',
      });

      expect(prisma.quality_records.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          skip: 5,
          take: 5,
          where: {
            isDeleted: false,
            supplierId: { in: ['supplier-1'] },
          },
        }),
      );
    });

    it('does not fall back to names or inspection relations', async () => {
      vi.mocked(prisma.quality_records.count).mockResolvedValue(0);
      vi.mocked(prisma.quality_records.findMany).mockResolvedValue([]);

      await InspectionIssueListService.findSupplierIssues({
        supplierId: 'supplier-1',
      });

      expect(prisma.quality_records.count).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          supplierId: { in: ['supplier-1'] },
        },
      });
    });

    it('keeps manual process issues visible without a TEAM mapping', async () => {
      vi.mocked(prisma.quality_records.count).mockResolvedValue(1);
      vi.mocked(prisma.quality_records.findMany).mockResolvedValue([]);

      await expect(
        InspectionIssueListService.findSupplierIssues({
          supplierId: 'supplier-1',
        }),
      ).resolves.toEqual({ items: [], total: 1 });
      expect(prisma.quality_records.findMany).toHaveBeenCalled();
    });
  });

  describe('getIssues', () => {
    it('should return empty results when no records exist', async () => {
      (prisma.quality_records.count as any).mockResolvedValue(0);
      (prisma.quality_records.findMany as any).mockResolvedValue([]);

      const result = await InspectionIssueListService.getIssues({
        year: 2024,
      });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should apply supplierName filter', async () => {
      (prisma.quality_records.count as any).mockResolvedValue(0);
      (prisma.quality_records.findMany as any).mockResolvedValue([]);

      await InspectionIssueListService.getIssues({
        supplierName: '供应商A',
        year: 2024,
      });

      expect(prisma.quality_records.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            supplierName: { contains: '供应商A' },
          }),
        }),
      );
    });

    it('should apply projectName filter', async () => {
      (prisma.quality_records.count as any).mockResolvedValue(0);
      (prisma.quality_records.findMany as any).mockResolvedValue([]);

      await InspectionIssueListService.getIssues({
        projectName: 'P1',
        year: 2024,
      });

      expect(prisma.quality_records.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectName: { contains: 'P1' },
          }),
        }),
      );
    });

    it('should apply workOrderNumber filter', async () => {
      (prisma.quality_records.count as any).mockResolvedValue(0);
      (prisma.quality_records.findMany as any).mockResolvedValue([]);

      await InspectionIssueListService.getIssues({
        workOrderNumber: 'WO-1001',
        year: 2024,
      });

      expect(prisma.quality_records.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workOrderNumber: { contains: 'WO-1001' },
          }),
        }),
      );
    });

    it('should apply severity filter as array', async () => {
      (prisma.quality_records.count as any).mockResolvedValue(0);
      (prisma.quality_records.findMany as any).mockResolvedValue([]);

      await InspectionIssueListService.getIssues({
        severity: ['Critical', 'Major'],
        year: 2024,
      });

      expect(prisma.quality_records.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            severity: { in: ['Critical', 'Major'] },
          }),
        }),
      );
    });

    it('should apply severity filter as string', async () => {
      (prisma.quality_records.count as any).mockResolvedValue(0);
      (prisma.quality_records.findMany as any).mockResolvedValue([]);

      await InspectionIssueListService.getIssues({
        severity: 'Critical',
        year: 2024,
      });

      expect(prisma.quality_records.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            severity: 'Critical',
          }),
        }),
      );
    });

    it('should apply status filter', async () => {
      (prisma.quality_records.count as any).mockResolvedValue(0);
      (prisma.quality_records.findMany as any).mockResolvedValue([]);

      await InspectionIssueListService.getIssues({
        status: 'CLOSED',
        year: 2024,
      });

      expect(prisma.quality_records.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'CLOSED',
          }),
        }),
      );
    });

    it('should apply pagination with skip and take', async () => {
      (prisma.quality_records.count as any).mockResolvedValue(0);
      (prisma.quality_records.findMany as any).mockResolvedValue([]);

      await InspectionIssueListService.getIssues({
        page: 2,
        pageSize: 10,
        year: 2024,
      });

      expect(prisma.quality_records.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });

    it('should not apply skip and take when pageSize is 0', async () => {
      (prisma.quality_records.count as any).mockResolvedValue(0);
      (prisma.quality_records.findMany as any).mockResolvedValue([]);

      await InspectionIssueListService.getIssues({
        pageSize: 0,
        year: 2024,
      });

      expect(prisma.quality_records.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: undefined,
          take: undefined,
        }),
      );
    });

    it('should apply custom sort', async () => {
      (prisma.quality_records.count as any).mockResolvedValue(0);
      (prisma.quality_records.findMany as any).mockResolvedValue([]);

      await InspectionIssueListService.getIssues({
        sortBy: 'severity',
        sortOrder: 'asc',
        year: 2024,
      });

      expect(prisma.quality_records.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { severity: 'asc' },
        }),
      );
    });

    it('should default to createdAt desc sort', async () => {
      (prisma.quality_records.count as any).mockResolvedValue(0);
      (prisma.quality_records.findMany as any).mockResolvedValue([]);

      await InspectionIssueListService.getIssues({ year: 2024 });

      expect(prisma.quality_records.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('restricts ordinary users to records they created', async () => {
      (prisma.quality_records.count as any).mockResolvedValue(0);
      (prisma.quality_records.findMany as any).mockResolvedValue([]);

      await InspectionIssueListService.getIssues({
        userContext: {
          roles: ['quality_inspector'],
          userId: 'user-1',
        },
        year: 2024,
      });

      expect(prisma.quality_records.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ createdBy: 'user-1' }),
      });
    });

    it.each([['admin'], ['super_admin'], ['system_admin']])(
      'does not restrict %s users by creator',
      async (role) => {
        (prisma.quality_records.count as any).mockResolvedValue(0);
        (prisma.quality_records.findMany as any).mockResolvedValue([]);

        await InspectionIssueListService.getIssues({
          userContext: { roles: [role], userId: 'admin-1' },
          year: 2024,
        });

        const where = (prisma.quality_records.count as any).mock.calls[0][0]
          .where;
        expect(where.createdBy).toBeUndefined();
      },
    );

    it('should map ncNumber sort field to nonConformanceNumber', async () => {
      (prisma.quality_records.count as any).mockResolvedValue(0);
      (prisma.quality_records.findMany as any).mockResolvedValue([]);

      await InspectionIssueListService.getIssues({
        sortBy: 'ncNumber',
        sortOrder: 'asc',
        year: 2024,
      });

      expect(prisma.quality_records.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { nonConformanceNumber: 'asc' },
        }),
      );
    });

    it('should return mapped items with default values', async () => {
      (prisma.quality_records.count as any).mockResolvedValue(1);
      (prisma.quality_records.findMany as any).mockResolvedValue([
        {
          id: 'rec-1',
          nonConformanceNumber: 'NC-24KJ-001',
          date: new Date('2024-01-15'),
          defectType: '焊接缺陷',
          defectSubtype: '气孔',
          severity: null,
          status: 'OPEN',
          lossAmount: null,
          inspector: null,
          responsibleDepartment: null,
          responsibleDepartments: null,
          responsibleWelder: null,
          rootCause: null,
          solution: null,
          partName: null,
          description: null,
          isClaim: false,
          issuePhoto: null,
          projectName: null,
          workOrderNumber: null,
          supplierName: null,
          quantity: null,
          updatedAt: new Date('2024-01-15'),
          process: null,
        },
      ]);

      const result = await InspectionIssueListService.getIssues({ year: 2024 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].ncNumber).toBe('NC-24KJ-001');
      expect(result.items[0].severity).toBe('Minor');
      expect(result.items[0].lossAmount).toBe(0);
      expect(result.items[0].title).toBe('');
      expect(result.items[0].claim).toBe('No');
    });
  });

  describe('getIssueById', () => {
    it('queries ordinary-user detail by id and creator', async () => {
      const { resolveCanonicalProcessName } = await import(
        '~/utils/process-resolver'
      );
      vi.mocked(resolveCanonicalProcessName).mockReturnValue('Welding');
      (prisma.quality_records.findFirst as any).mockResolvedValue({
        id: 'rec-1',
        nonConformanceNumber: 'NC-26KJ-001',
        date: new Date('2026-07-10'),
        severity: 'Major',
        status: 'OPEN',
        lossAmount: 12,
        inspector: 'inspector',
        responsibleDepartment: 'dept-1',
        responsibleDepartments: null,
        responsibleWelder: null,
        rootCause: 'Cause',
        solution: 'Solution',
        partName: 'Frame',
        description: 'Issue',
        isClaim: false,
        issuePhoto: '[]',
        projectName: 'Project',
        workOrderNumber: 'WO-1',
        quantity: 1,
        updatedAt: new Date('2026-07-10'),
        process: { name: 'Welding' },
      });

      const result = await InspectionIssueListService.getIssueById({
        id: 'rec-1',
        userContext: {
          roles: ['quality_inspector'],
          userId: 'user-1',
          username: 'inspector',
        },
      });

      expect(prisma.quality_records.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            createdBy: 'user-1',
            id: 'rec-1',
            isDeleted: false,
          },
        }),
      );
      expect(result).toMatchObject({
        id: 'rec-1',
        ncNumber: 'NC-26KJ-001',
        processName: 'Welding',
      });
    });

    it('allows a super admin to query detail without a creator filter', async () => {
      (prisma.quality_records.findFirst as any).mockResolvedValue(null);

      await InspectionIssueListService.getIssueById({
        id: 'rec-2',
        userContext: { roles: ['super_admin'], userId: 'admin-1' },
      });

      expect(prisma.quality_records.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rec-2', isDeleted: false },
        }),
      );
    });
  });
});
