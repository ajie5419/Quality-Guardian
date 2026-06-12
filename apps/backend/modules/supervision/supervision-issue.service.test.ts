import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupervisionIssueService } from '~/modules/supervision/supervision-issue.service';

vi.mock('~/utils/governed-write', () => ({
  buildGovernedCanonicalWritePairForTable: vi.fn().mockResolvedValue({}),
  buildGovernedWriteFieldsForTable: vi.fn().mockReturnValue({}),
}));

vi.mock('~/modules/supervision/supervision-shared', async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    prisma: {
      supervision_issue_actions: {
        create: vi.fn().mockResolvedValue({
          actionType: 'FOLLOW_UP',
          attachments: null,
          createdAt: new Date(),
          createdBy: null,
          description: 'test',
          id: 'ia-1',
          issueId: 'iss-1',
        }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      supervision_issues: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({
          affectsProgress: false,
          closedAt: null,
          correctiveAction: null,
          createdAt: new Date(),
          createdBy: null,
          description: 'Test issue',
          dueAt: null,
          estimatedLoss: 0,
          id: 'iss-1',
          isClaim: false,
          issueNo: 'SP-20260612-0001',
          issueType: 'QUALITY',
          photos: null,
          projectId: 'proj-1',
          project: { projectName: 'Project A' },
          rectificationPhotos: null,
          responsibleUnit: null,
          severity: 'minor',
          status: 'OPEN',
          taskId: null,
          updatedAt: new Date(),
          verifyResult: null,
        }),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({
          affectsProgress: false,
          closedAt: null,
          correctiveAction: null,
          createdAt: new Date(),
          createdBy: null,
          description: 'Updated',
          dueAt: null,
          estimatedLoss: 0,
          id: 'iss-1',
          isClaim: false,
          issueNo: 'SP-20260612-0001',
          issueType: 'QUALITY',
          photos: null,
          projectId: 'proj-1',
          project: { projectName: 'Project A' },
          rectificationPhotos: null,
          responsibleUnit: null,
          severity: 'minor',
          status: 'OPEN',
          taskId: null,
          updatedAt: new Date(),
          verifyResult: null,
        }),
      },
      $transaction: vi.fn().mockImplementation(async (cb: any) => {
        const tx = {
          supervision_issue_actions: {
            create: vi.fn().mockResolvedValue({
              actionType: 'FOLLOW_UP',
              attachments: null,
              createdAt: new Date(),
              createdBy: null,
              description: 'test',
              id: 'ia-1',
              issueId: 'iss-1',
            }),
          },
          supervision_issues: {
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return cb(tx);
      }),
    },
  };
});

describe('supervisionIssueService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createIssue', () => {
    it('should create an issue and return mapped result', async () => {
      const result = await SupervisionIssueService.createIssue({
        description: 'Test issue',
        projectId: 'proj-1',
      });

      expect(result).toHaveProperty('id', 'iss-1');
      expect(result).toHaveProperty('description', 'Test issue');
      expect(result).toHaveProperty('status', 'OPEN');
    });

    it('should default issue type to QUALITY', async () => {
      const { supervision_issues } = await import(
        '~/modules/supervision/supervision-shared'
      ).then((m: any) => m.prisma);

      await SupervisionIssueService.createIssue({
        description: 'Test',
        projectId: 'proj-1',
      });

      const createData = supervision_issues.create.mock.calls[0][0].data;
      expect(createData.issueType).toBe('QUALITY');
    });
  });

  describe('listIssues', () => {
    it('should return paginated issues', async () => {
      const result = await SupervisionIssueService.listIssues({
        page: 1,
        pageSize: 10,
      });

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should default page to 1', async () => {
      const result = await SupervisionIssueService.listIssues({});

      expect(result).toHaveProperty('items');
    });
  });

  describe('updateIssue', () => {
    it('should update issue and return mapped result', async () => {
      const result = await SupervisionIssueService.updateIssue('iss-1', {
        description: 'Updated',
      });

      expect(result).toHaveProperty('id');
    });

    it('should set closedAt when status is CLOSED', async () => {
      await SupervisionIssueService.updateIssue('iss-1', {
        status: 'CLOSED',
      });

      const { supervision_issues } = await import(
        '~/modules/supervision/supervision-shared'
      ).then((m: any) => m.prisma);

      const updateData = supervision_issues.update.mock.calls[0][0].data;
      expect(updateData.closedAt).toBeInstanceOf(Date);
    });
  });

  describe('deleteIssue', () => {
    it('should soft delete an issue', async () => {
      await SupervisionIssueService.deleteIssue('iss-1');

      const { supervision_issues } = await import(
        '~/modules/supervision/supervision-shared'
      ).then((m: any) => m.prisma);

      expect(supervision_issues.update).toHaveBeenCalledWith({
        data: { isDeleted: true },
        where: { id: 'iss-1' },
      });
    });
  });

  describe('createIssueAction', () => {
    it('should create an action within a transaction', async () => {
      const result = await SupervisionIssueService.createIssueAction(
        'iss-1',
        { description: 'Follow up' },
        'user-1',
      );

      expect(result).toHaveProperty('id', 'ia-1');
      expect(result).toHaveProperty('issueId', 'iss-1');
    });

    it('should update issue status when provided', async () => {
      await SupervisionIssueService.createIssueAction(
        'iss-1',
        { description: 'Closing', status: 'CLOSED' },
        'user-1',
      );

      const { $transaction } = await import(
        '~/modules/supervision/supervision-shared'
      ).then((m: any) => m.prisma);

      expect($transaction).toHaveBeenCalled();
    });
  });

  describe('listIssueActions', () => {
    it('should return actions for an issue', async () => {
      const result = await SupervisionIssueService.listIssueActions('iss-1');

      expect(Array.isArray(result)).toBe(true);
    });
  });
});
