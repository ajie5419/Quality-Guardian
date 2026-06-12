import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupervisionProjectService } from '~/modules/supervision/supervision-project.service';

vi.mock('~/utils/governed-write', () => ({
  buildGovernedCanonicalWritePairForTable: vi.fn().mockResolvedValue({}),
  buildGovernedWriteFieldsForTable: vi.fn().mockReturnValue({}),
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
          supervisor: null,
          updatedAt: new Date(),
          workOrderNumber: null,
        }),
        findMany: vi.fn().mockResolvedValue([]),
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
          supervisor: null,
          updatedAt: new Date(),
          workOrderNumber: null,
        }),
      },
    },
  };
});

describe('supervisionProjectService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createProject', () => {
    it('should create a project and return mapped result', async () => {
      const result = await SupervisionProjectService.createProject({
        projectName: 'Test Project',
        projectType: 'QUALITY',
      });

      expect(result).toHaveProperty('id', 'sp-1');
      expect(result).toHaveProperty('projectName', 'Test Project');
      expect(result).toHaveProperty('status', 'PLANNED');
    });

    it('should default status to PLANNED', async () => {
      const result = await SupervisionProjectService.createProject({
        projectName: 'New Project',
      });

      expect(result.status).toBe('PLANNED');
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
      const result = await SupervisionProjectService.updateProject('sp-1', {
        projectName: 'Updated Project',
      });

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('projectName');
    });
  });

  describe('deleteProject', () => {
    it('should soft delete a project', async () => {
      await SupervisionProjectService.deleteProject('sp-1');

      const { prisma: mockPrisma } = await import(
        '~/modules/supervision/supervision-shared'
      );

      expect(
        (mockPrisma as any).supervision_projects.update,
      ).toHaveBeenCalledWith({
        data: { isDeleted: true },
        where: { id: 'sp-1' },
      });
    });
  });
});
