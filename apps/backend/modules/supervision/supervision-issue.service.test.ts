import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withRequestIdempotency } from '~/modules/idempotency';
import { SupervisionIssueService } from '~/modules/supervision/supervision-issue.service';

vi.mock('~/utils/governed-write', () => ({
  buildGovernedCanonicalWritePairForTable: vi.fn().mockResolvedValue({}),
  buildGovernedWriteFieldsForTable: vi.fn().mockReturnValue({}),
}));
vi.mock('~/modules/idempotency', async (original) => ({
  ...(await original<typeof import('~/modules/idempotency')>()),
  withRequestIdempotency: vi.fn(),
}));

vi.mock('~/modules/system-log', () => ({
  SystemLogService: {
    auditLog: vi.fn().mockResolvedValue(undefined),
  },
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
        findFirst: vi.fn().mockResolvedValue({
          id: 'iss-1',
          status: 'OPEN',
        }),
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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
      supervision_projects: {
        findFirst: vi.fn().mockResolvedValue({ id: 'proj-1' }),
      },
      supervision_plan_tasks: {
        findFirst: vi.fn().mockResolvedValue({ id: 'task-1' }),
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
            findFirst: vi.fn().mockResolvedValue({
              id: 'iss-1',
              status: 'OPEN',
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return cb(tx);
      }),
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

describe('supervisionIssueService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createIssue', () => {
    it('should create an issue and return mapped result', async () => {
      const result = await SupervisionIssueService.createIssue(
        {
          description: 'Test issue',
          projectId: 'proj-1',
        },
        context,
      );

      expect(result).toHaveProperty('id', 'iss-1');
      expect(result).toHaveProperty('description', 'Test issue');
      expect(result).toHaveProperty('status', 'OPEN');
    });

    it('should default issue type to QUALITY', async () => {
      const { supervision_issues } = await import(
        '~/modules/supervision/supervision-shared'
      ).then((m: any) => m.prisma);

      await SupervisionIssueService.createIssue(
        {
          description: 'Test',
          projectId: 'proj-1',
        },
        context,
      );

      const createData = supervision_issues.create.mock.calls[0][0].data;
      expect(createData.issueType).toBe('QUALITY');
    });

    it('rejects a task outside the authorized project before creating an issue', async () => {
      const { supervision_issues, supervision_plan_tasks } = await import(
        '~/modules/supervision/supervision-shared'
      ).then((m: any) => m.prisma);
      supervision_plan_tasks.findFirst.mockResolvedValueOnce(null);

      await expect(
        SupervisionIssueService.createIssue(
          {
            description: 'Cross-project issue',
            projectId: 'proj-1',
            taskId: 'task-from-another-project',
          },
          context,
        ),
      ).rejects.toMatchObject({ httpStatus: 404 });
      expect(supervision_issues.create).not.toHaveBeenCalled();
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
      const result = await SupervisionIssueService.updateIssue(
        'iss-1',
        {
          description: 'Updated',
        },
        context,
      );

      expect(result).toHaveProperty('id');
    });

    it('should set closedAt when status is CLOSED', async () => {
      await SupervisionIssueService.updateIssue(
        'iss-1',
        {
          status: 'CLOSED',
        },
        context,
      );

      const { supervision_issues } = await import(
        '~/modules/supervision/supervision-shared'
      ).then((m: any) => m.prisma);

      const updateData = supervision_issues.updateMany.mock.calls[0][0].data;
      expect(updateData.closedAt).toBeInstanceOf(Date);
    });
  });

  describe('deleteIssue', () => {
    it('should soft delete an issue', async () => {
      await SupervisionIssueService.deleteIssue('iss-1', context);

      const { supervision_issues } = await import(
        '~/modules/supervision/supervision-shared'
      ).then((m: any) => m.prisma);

      expect(supervision_issues.updateMany).toHaveBeenCalledWith({
        data: { isDeleted: true },
        where: {
          id: 'iss-1',
          isDeleted: false,
          status: { not: 'CLOSED' },
          createdBy: 'user-1',
        },
      });
    });
  });

  describe('createIssueAction', () => {
    it('replays keyed actions without starting a second business transaction', async () => {
      const { prisma } = await import('./supervision-shared');
      const response = { id: 'existing-action', issueId: 'iss-1' };
      vi.mocked(withRequestIdempotency).mockResolvedValueOnce({
        replayed: true,
        response,
        responseStatus: 200,
        resourceId: 'existing-action',
        resourceType: 'supervision_issue_action',
      });
      await expect(
        SupervisionIssueService.createIssueAction(
          'iss-1',
          { status: 'CLOSED' },
          context,
          'same-form-key',
        ),
      ).resolves.toEqual(response);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      const options = vi.mocked(withRequestIdempotency).mock.calls[0][0];
      expect(options).toMatchObject({
        actorKey: 'user:user-1',
        operationKey: 'qms.supervision.issue-action:iss-1',
        idempotencyKey: 'same-form-key',
      });
      const inaccessible = {
        supervision_issues: { findFirst: vi.fn().mockResolvedValue(null) },
      };
      expect(
        await options.resourceGuard?.(inaccessible as any, 'existing-action'),
      ).toBe(false);
      expect(inaccessible.supervision_issues.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: { id: 'iss-1', isDeleted: false, createdBy: 'user-1' },
      });
    });

    it('runs keyed state claims on the supplied transaction and propagates a lost CAS', async () => {
      const create = vi
        .fn()
        .mockResolvedValue({ id: 'action-1', issueId: 'iss-1' });
      const updateMany = vi.fn().mockResolvedValue({ count: 0 });
      vi.mocked(withRequestIdempotency).mockImplementationOnce(
        async (options) =>
          options.run({
            supervision_issues: {
              findFirst: vi
                .fn()
                .mockResolvedValue({ id: 'iss-1', status: 'OPEN' }),
              updateMany,
            },
            supervision_issue_actions: { create },
          } as any) as any,
      );
      await expect(
        SupervisionIssueService.createIssueAction(
          'iss-1',
          { status: 'CLOSED' },
          context,
          'new-form-key',
        ),
      ).rejects.toMatchObject({ httpStatus: 409 });
      expect(create).toHaveBeenCalledTimes(1);
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'iss-1',
            isDeleted: false,
            createdBy: 'user-1',
            status: 'OPEN',
          },
        }),
      );
    });

    it('should create an action within a transaction', async () => {
      const result = await SupervisionIssueService.createIssueAction(
        'iss-1',
        { description: 'Follow up' },
        context,
      );

      expect(result).toHaveProperty('id', 'ia-1');
      expect(result).toHaveProperty('issueId', 'iss-1');
    });

    it('should update issue status when provided', async () => {
      await SupervisionIssueService.createIssueAction(
        'iss-1',
        { description: 'Closing', status: 'CLOSED' },
        context,
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
