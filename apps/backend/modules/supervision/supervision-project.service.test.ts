import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupervisionProjectService } from '~/modules/supervision/supervision-project.service';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';

vi.mock('~/utils/governed-write', () => ({
  buildGovernedCanonicalWritePairForTable: vi.fn(
    async (_table: string, fields: Record<string, unknown>) =>
      fields.supplierId === undefined ? {} : { supplierId: fields.supplierId },
  ),
  buildGovernedWriteFieldsForTable: vi.fn(
    (_table: string, fields: Record<string, unknown>) =>
      fields.supplierName === undefined
        ? {}
        : { supplierName: fields.supplierName },
  ),
}));

vi.mock('~/modules/system-log', () => ({
  SystemLogService: {
    auditLog: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('~/utils/query-helpers', () => ({
  buildKeywordOr: vi.fn().mockReturnValue(null),
}));

vi.mock('~/modules/supervision/supervision-shared', async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    prisma: {
      supervision_daily_reports: {
        groupBy: vi.fn().mockResolvedValue([]),
      },
      supervision_issues: {
        groupBy: vi.fn().mockResolvedValue([]),
      },
      supervision_projects: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({
          actualEndAt: null,
          actualStartAt: null,
          createdAt: new Date(),
          id: 'sp-1',
          location: null,
          participants: null,
          plannedEndAt: null,
          plannedStartAt: null,
          progressPercent: 0,
          projectName: 'Test Project',
          projectType: 'QUALITY',
          riskLevel: 'LOW',
          stage: null,
          status: 'PLANNING',
          summary: null,
          supplierId: 'supplier-1',
          supplierName: 'Supplier A',
          supervisor: null,
          updatedAt: new Date(),
          workOrderNumber: null,
        }),
        findFirst: vi.fn().mockResolvedValue({
          actualEndAt: null,
          actualStartAt: null,
          createdAt: new Date(),
          id: 'sp-1',
          location: null,
          participants: null,
          plannedEndAt: null,
          plannedStartAt: null,
          progressPercent: 0,
          projectName: 'Test Project',
          projectType: 'QUALITY',
          riskLevel: 'LOW',
          stage: null,
          status: 'PLANNED',
          summary: null,
          supplierId: 'supplier-1',
          supplierName: 'Supplier A',
          supervisor: null,
          updatedAt: new Date(),
          workOrderNumber: null,
        }),
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({
          actualEndAt: null,
          actualStartAt: null,
          createdAt: new Date(),
          id: 'sp-1',
          location: null,
          participants: null,
          plannedEndAt: null,
          plannedStartAt: null,
          progressPercent: 0,
          projectName: 'Test Project',
          projectType: 'QUALITY',
          riskLevel: 'LOW',
          stage: null,
          status: 'PLANNING',
          summary: null,
          supplierId: 'supplier-1',
          supplierName: 'Supplier A',
          supervisor: null,
          updatedAt: new Date(),
          workOrderNumber: null,
        }),
      },
      supervision_plan_tasks: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
  };
});

const context = {
  isAdmin: false,
  userId: 'user-1',
  user: {
    id: 'user-1',
    realName: 'User One',
    roles: [],
    username: 'user1',
  },
};

describe('supervisionProjectService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createProject', () => {
    it('should create a project and return mapped result', async () => {
      const result = await SupervisionProjectService.createProject(
        {
          projectName: 'Test Project',
          projectType: 'QUALITY',
        },
        context,
      );

      expect(result).toHaveProperty('id', 'sp-1');
      expect(result).toHaveProperty('projectName', 'Test Project');
      expect(result).toHaveProperty('status', 'PLANNED');
      expect(result).toHaveProperty('supplierId', 'supplier-1');
    });

    it('should default status to PLANNED', async () => {
      const result = await SupervisionProjectService.createProject(
        {
          projectName: 'New Project',
        },
        context,
      );

      expect(result.status).toBe('PLANNED');
    });

    it('should validate and write explicit supplier identity', async () => {
      await SupervisionProjectService.createProject(
        {
          projectName: 'Supplier Project',
          supplierId: 'supplier-1',
          supplierName: 'Supplier A',
        },
        context,
      );

      expect(buildGovernedWriteFieldsForTable).toHaveBeenCalledWith(
        'supervision_projects',
        expect.objectContaining({ supplierName: 'Supplier A' }),
      );
      expect(buildGovernedCanonicalWritePairForTable).toHaveBeenCalledWith(
        'supervision_projects',
        expect.objectContaining({
          supplierId: 'supplier-1',
          supplierName: 'Supplier A',
        }),
      );
      const { prisma: mockPrisma } = await import(
        '~/modules/supervision/supervision-shared'
      );
      expect(mockPrisma.supervision_projects.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          supplierId: 'supplier-1',
          supplierName: 'Supplier A',
        }),
      });
    });
  });

  describe('listProjects', () => {
    it('should return paginated projects', async () => {
      const result = await SupervisionProjectService.listProjects({
        page: 1,
        pageSize: 10,
      });

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should default page to 1', async () => {
      const result = await SupervisionProjectService.listProjects({});

      expect(result).toHaveProperty('items');
    });
  });

  describe('updateProject', () => {
    it('should update project and return mapped result', async () => {
      const result = await SupervisionProjectService.updateProject(
        'sp-1',
        {
          projectName: 'Updated Project',
        },
        context,
      );

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('projectName');
    });

    it('should validate and update explicit supplier identity', async () => {
      await SupervisionProjectService.updateProject(
        'sp-1',
        {
          supplierId: 'supplier-2',
          supplierName: 'Supplier B',
        },
        context,
      );

      expect(buildGovernedCanonicalWritePairForTable).toHaveBeenCalledWith(
        'supervision_projects',
        expect.objectContaining({
          supplierId: 'supplier-2',
          supplierName: 'Supplier B',
        }),
      );
      const { prisma: mockPrisma } = await import(
        '~/modules/supervision/supervision-shared'
      );
      expect(mockPrisma.supervision_projects.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({
          supplierId: 'supplier-2',
          supplierName: 'Supplier B',
        }),
        where: {
          id: 'sp-1',
          isDeleted: false,
          status: 'PLANNED',
          createdBy: 'user-1',
        },
      });
    });
  });

  describe('deleteProject', () => {
    it('should soft delete a project', async () => {
      await SupervisionProjectService.deleteProject('sp-1', context);

      const { prisma: mockPrisma } = await import(
        '~/modules/supervision/supervision-shared'
      );

      expect(
        (mockPrisma as any).supervision_projects.updateMany,
      ).toHaveBeenCalledWith({
        data: { isDeleted: true },
        where: {
          id: 'sp-1',
          isDeleted: false,
          status: { not: 'COMPLETED' },
          createdBy: 'user-1',
        },
      });
    });
  });
});
