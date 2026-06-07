import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupervisionIssueService } from '~/modules/supervision/supervision-issue.service';
import { SupervisionProjectService } from '~/modules/supervision/supervision-project.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    supervision_daily_reports: {
      groupBy: vi.fn(),
    },
    supervision_issue_actions: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    supervision_issues: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      update: vi.fn(),
    },
    supervision_projects: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/utils/governed-write', () => ({
  buildGovernedWriteFieldsForTable: (
    _table: string,
    fields: Record<string, unknown>,
  ) => fields,
  buildGovernedCanonicalWritePairForTable: vi.fn(async () => ({
    canonicalId: 'canon-1',
  })),
}));

const projectRow = {
  actualEndAt: null,
  actualStartAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  id: 'project-1',
  location: 'Plant',
  participants: '["Alice","Bob"]',
  plannedEndAt: new Date('2026-02-01T00:00:00.000Z'),
  plannedStartAt: new Date('2026-01-01T00:00:00.000Z'),
  progressPercent: 20,
  projectName: 'Project A',
  projectType: 'FIRST_ARTICLE',
  riskLevel: 'LOW',
  stage: 'Stage',
  status: 'IN_PROGRESS',
  summary: 'Summary',
  supplierName: 'Supplier',
  supervisor: 'Lead',
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  workOrderNumber: 'WO-1',
};

const issueRow = {
  affectsProgress: true,
  closedAt: null,
  correctiveAction: 'Fix',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  createdBy: 'admin',
  description: 'Issue',
  dueAt: new Date('2026-01-10T00:00:00.000Z'),
  estimatedLoss: 10,
  id: 'issue-1',
  isClaim: true,
  issueNo: 'SP-20260101-0001',
  issueType: 'QUALITY',
  photos: '["/a.png"]',
  project: { projectName: 'Project A' },
  projectId: 'project-1',
  rectificationPhotos: '[]',
  responsibleUnit: 'Supplier',
  severity: 'major',
  status: 'OPEN',
  taskId: 'task-1',
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  verifyResult: '',
};

describe('supervisionProjectService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates project with normalized governed fields', async () => {
    vi.mocked(prisma.supervision_projects.create).mockResolvedValue(
      projectRow as never,
    );

    const result = await SupervisionProjectService.createProject({
      participants: ['Alice', 'Bob'],
      progressPercent: 20,
      projectName: 'Project A',
      projectType: 'first_article',
      supplierName: 'Supplier',
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'project-1',
        participants: ['Alice', 'Bob'],
        projectName: 'Project A',
      }),
    );
    expect(prisma.supervision_projects.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        canonicalId: 'canon-1',
        participants: '["Alice","Bob"]',
        progressPercent: 20,
        projectName: 'Project A',
      }),
    });
  });

  it('lists projects with issue/report aggregates', async () => {
    vi.mocked(prisma.supervision_projects.findMany).mockResolvedValue([
      projectRow,
    ] as never);
    vi.mocked(prisma.supervision_projects.count).mockResolvedValue(1 as never);
    (prisma.supervision_issues.groupBy as any).mockResolvedValue([
      { _count: { id: 2 }, projectId: 'project-1', status: 'OPEN' },
      { _count: { id: 1 }, projectId: 'project-1', status: 'CLOSED' },
    ]);
    (prisma.supervision_daily_reports.groupBy as any).mockResolvedValue([
      {
        _max: { reportDate: new Date('2026-01-05T00:00:00.000Z') },
        projectId: 'project-1',
      },
    ]);

    const result = await SupervisionProjectService.listProjects({
      keyword: 'Project',
      page: 2,
      pageSize: 5,
      status: 'IN_PROGRESS',
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        closedIssueCount: 1,
        latestReportDate: '2026-01-05',
        openIssueCount: 2,
        totalIssueCount: 3,
      }),
    );
    expect(prisma.supervision_projects.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 5,
        where: expect.objectContaining({ isDeleted: false }),
      }),
    );
  });

  it('updates and soft deletes project', async () => {
    vi.mocked(prisma.supervision_projects.update).mockResolvedValue(
      projectRow as never,
    );

    await SupervisionProjectService.updateProject('project-1', {
      participants: ['Carol'],
      progressPercent: 100,
      status: 'completed',
    });
    await SupervisionProjectService.deleteProject('project-1');

    expect(prisma.supervision_projects.update).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      data: expect.objectContaining({
        canonicalId: 'canon-1',
        participants: '["Carol"]',
        progressPercent: 100,
        status: 'COMPLETED',
      }),
    });
    expect(prisma.supervision_projects.update).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: { id: 'project-1' },
    });
  });
});

describe('supervisionIssueService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates issue with generated issue number and governed type', async () => {
    vi.mocked(prisma.supervision_issues.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.supervision_issues.create).mockResolvedValue(
      issueRow as never,
    );

    const result = await SupervisionIssueService.createIssue(
      {
        affectsProgress: true,
        description: 'Issue',
        estimatedLoss: 10,
        issueType: 'quality',
        photos: ['/a.png'],
        projectId: 'project-1',
        status: 'open',
      },
      'admin',
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: 'issue-1',
        issueNo: 'SP-20260101-0001',
        photos: ['/a.png'],
      }),
    );
    expect(prisma.supervision_issues.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          canonicalId: 'canon-1',
          createdBy: 'admin',
          issueType: 'QUALITY',
          photos: '["/a.png"]',
        }),
      }),
    );
  });

  it('creates issue action and conditionally updates issue in transaction', async () => {
    const tx = {
      supervision_issue_actions: {
        create: vi.fn().mockResolvedValue({
          actionType: 'CLOSE',
          attachments: '["/a.png"]',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          createdBy: 'admin',
          description: 'closed',
          id: 'action-1',
          issueId: 'issue-1',
        }),
      },
      supervision_issues: { update: vi.fn() },
    };
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(tx));

    const result = await SupervisionIssueService.createIssueAction(
      'issue-1',
      {
        actionType: 'close',
        attachments: ['/a.png'],
        description: 'closed',
        status: 'closed',
        verifyResult: 'ok',
      },
      'admin',
    );

    expect(result).toEqual(
      expect.objectContaining({ actionType: 'CLOSE', attachments: ['/a.png'] }),
    );
    expect(tx.supervision_issues.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        closedAt: expect.any(Date),
        status: 'CLOSED',
        verifyResult: 'ok',
      }),
      where: { id: 'issue-1' },
    });
  });

  it('lists issue actions and paged issues', async () => {
    vi.mocked(prisma.supervision_issue_actions.findMany).mockResolvedValue([
      {
        actionType: 'FOLLOW_UP',
        attachments: '[]',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        createdBy: 'admin',
        description: 'follow',
        id: 'action-1',
        issueId: 'issue-1',
      },
    ] as never);
    vi.mocked(prisma.supervision_issues.findMany).mockResolvedValue([
      issueRow,
    ] as never);
    vi.mocked(prisma.supervision_issues.count).mockResolvedValue(1 as never);

    const actions = await SupervisionIssueService.listIssueActions('issue-1');
    const issues = await SupervisionIssueService.listIssues({
      issueType: 'quality',
      page: 2,
      pageSize: 5,
      projectId: 'project-1',
      status: 'OPEN',
    });

    expect(actions).toHaveLength(1);
    expect(issues.total).toBe(1);
    expect(prisma.supervision_issues.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 5,
        where: {
          isDeleted: false,
          issueType: 'QUALITY',
          projectId: 'project-1',
          status: 'OPEN',
        },
      }),
    );
  });

  it('updates and soft deletes issue', async () => {
    vi.mocked(prisma.supervision_issues.update).mockResolvedValue({
      ...issueRow,
      status: 'CLOSED',
      closedAt: new Date('2026-01-03T00:00:00.000Z'),
    } as never);

    await SupervisionIssueService.updateIssue('issue-1', {
      issueType: 'quality',
      photos: ['/b.png'],
      status: 'closed',
    });
    await SupervisionIssueService.deleteIssue('issue-1');

    expect(prisma.supervision_issues.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'issue-1' },
        data: expect.objectContaining({
          canonicalId: 'canon-1',
          closedAt: expect.any(Date),
          photos: '["/b.png"]',
          status: 'CLOSED',
        }),
      }),
    );
    expect(prisma.supervision_issues.update).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: { id: 'issue-1' },
    });
  });
});
