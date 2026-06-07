import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncSupervisionProjectProgress } from '~/modules/supervision/supervision-plan-task-progress';
import { SupervisionReportService } from '~/modules/supervision/supervision-report.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    supervision_daily_reports: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    supervision_projects: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/modules/supervision/supervision-plan-task-progress', () => ({
  syncSupervisionProjectProgress: vi.fn(),
}));

function reportRow(overrides: Record<string, unknown> = {}) {
  return {
    attachments: '["/report.png"]',
    completedMilestone: 'Task A：Done today',
    coordinationNeeded: 'Need crane',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    id: 'report-1',
    issueSummary: 'No issue',
    location: 'Plant',
    manpower: '5 people',
    progressPercent: 50,
    project: { projectName: 'Project A', workOrderNumber: 'WO-1' },
    projectId: 'project-1',
    reportDate: new Date('2026-01-02T00:00:00.000Z'),
    reporter: 'Alice',
    taskUpdates: [],
    tomorrowPlan: 'Task A：Next step',
    updatedAt: new Date('2026-01-03T00:00:00.000Z'),
    weather: 'Sunny',
    workContent: 'General work',
    ...overrides,
  };
}

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    actualEndAt: null,
    actualStartAt: null,
    completedQuantity: 2,
    id: 'task-1',
    plannedEndAt: new Date('2026-01-10T00:00:00.000Z'),
    plannedQuantity: 10,
    plannedStartAt: new Date('2026-01-01T00:00:00.000Z'),
    progressPercent: 20,
    projectId: 'project-1',
    quantityUnit: 'set',
    riskLevel: 'NORMAL',
    taskName: 'Task A',
    taskNo: '1',
    ...overrides,
  };
}

describe('supervisionReportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates report, summarizes task fields, updates task quantities, and syncs project progress', async () => {
    const tx = {
      supervision_daily_reports: {
        create: vi.fn().mockResolvedValue({ id: 'report-1' }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(
          reportRow({
            taskUpdates: [
              {
                completedQuantity: 5,
                createdAt: new Date('2026-01-02T00:00:00.000Z'),
                dailyQuantity: 3,
                id: 'update-1',
                nextPlan: 'Next step',
                photos: '["/task.png"]',
                plannedQuantity: 10,
                progressPercent: 50,
                projectId: 'project-1',
                quantityUnit: 'set',
                reportId: 'report-1',
                riskReason: '',
                status: 'IN_PROGRESS',
                task: {
                  actualEndAt: null,
                  actualStartAt: null,
                  plannedEndAt: new Date('2026-01-10T00:00:00.000Z'),
                  plannedStartAt: new Date('2026-01-01T00:00:00.000Z'),
                  progressPercent: 50,
                  riskLevel: 'NORMAL',
                },
                taskId: 'task-1',
                taskName: 'Task A',
                taskNo: '1',
                workContent: 'Done today',
              },
            ],
          }),
        ),
      },
      supervision_plan_tasks: {
        findFirst: vi.fn().mockResolvedValue(taskRow()),
        update: vi.fn(),
      },
      supervision_projects: {
        update: vi.fn(),
      },
      supervision_report_task_updates: {
        create: vi.fn(),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(tx));

    const result = await SupervisionReportService.createReport({
      attachments: ['/report.png'],
      completedMilestone: 'Stage from payload',
      location: 'Plant',
      progressPercent: 50,
      projectId: 'project-1',
      reportDate: '2026-01-02',
      reporter: 'Alice',
      taskUpdates: [
        {
          dailyQuantity: 3,
          nextPlan: 'Next step',
          photos: ['/task.png'],
          status: 'in_progress',
          taskId: 'task-1',
          taskName: 'Task A',
          workContent: 'Done today',
        },
      ],
    });

    expect(result.taskUpdates[0]).toEqual(
      expect.objectContaining({
        completedQuantity: 5,
        currentTaskStatus: 'DELAYED',
        photos: ['/task.png'],
        progressPercent: 50,
      }),
    );
    expect(tx.supervision_daily_reports.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attachments: '["/report.png"]',
        completedMilestone: 'Task A：Done today',
        projectId: 'project-1',
        tomorrowPlan: 'Task A：Next step',
      }),
    });
    expect(tx.supervision_report_task_updates.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        completedQuantity: 5,
        dailyQuantity: 3,
        progressPercent: 50,
        status: 'IN_PROGRESS',
      }),
    });
    expect(tx.supervision_plan_tasks.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        completedQuantity: 5,
        lastReportId: 'report-1',
        progressPercent: 50,
        status: 'DELAYED',
      }),
      where: { id: 'task-1' },
    });
    expect(syncSupervisionProjectProgress).toHaveBeenCalledWith(
      'project-1',
      tx,
    );
    expect(tx.supervision_projects.update).toHaveBeenCalledWith({
      data: { location: 'Plant', stage: 'Stage from payload' },
      where: { id: 'project-1' },
    });
  });

  it('marks a task done when submitted status is DONE and caps completed quantity', async () => {
    const tx = {
      supervision_daily_reports: {
        create: vi.fn().mockResolvedValue({ id: 'report-1' }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(reportRow()),
      },
      supervision_plan_tasks: {
        findFirst: vi.fn().mockResolvedValue(taskRow({ completedQuantity: 9 })),
        update: vi.fn(),
      },
      supervision_projects: {
        update: vi.fn(),
      },
      supervision_report_task_updates: {
        create: vi.fn(),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(tx));

    await SupervisionReportService.createReport({
      projectId: 'project-1',
      reportDate: '2026-01-02',
      reporter: 'Alice',
      taskUpdates: [{ dailyQuantity: 5, status: 'done', taskId: 'task-1' }],
    });

    expect(tx.supervision_report_task_updates.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        completedQuantity: 10,
        progressPercent: 100,
        status: 'DONE',
      }),
    });
    expect(tx.supervision_plan_tasks.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actualEndAt: new Date('2026-01-02T00:00:00.000Z'),
        completedQuantity: 10,
        progressPercent: 100,
        status: 'DONE',
      }),
      where: { id: 'task-1' },
    });
  });

  it('lists reports with pagination filters and maps real-time task status', async () => {
    vi.mocked(prisma.supervision_daily_reports.findMany).mockResolvedValue([
      reportRow({
        taskUpdates: [
          {
            completedQuantity: 1,
            dailyQuantity: 1,
            id: 'update-1',
            photos: '[]',
            plannedQuantity: 1,
            progressPercent: 100,
            projectId: 'project-1',
            quantityUnit: null,
            reportId: 'report-1',
            status: 'IN_PROGRESS',
            task: {
              actualEndAt: new Date('2026-01-02T00:00:00.000Z'),
              actualStartAt: new Date('2026-01-01T00:00:00.000Z'),
              plannedEndAt: new Date('2026-01-10T00:00:00.000Z'),
              plannedStartAt: new Date('2026-01-01T00:00:00.000Z'),
              progressPercent: 100,
              riskLevel: 'NORMAL',
            },
            taskId: 'task-1',
            taskName: 'Task A',
            taskNo: '1',
          },
        ],
      }),
    ] as never);
    vi.mocked(prisma.supervision_daily_reports.count).mockResolvedValue(
      1 as never,
    );

    const result = await SupervisionReportService.listReports({
      page: 2,
      pageSize: 5,
      projectId: 'project-1',
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.taskUpdates[0]?.currentTaskStatus).toBe('DONE');
    expect(prisma.supervision_daily_reports.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 5,
        where: { isDeleted: false, projectId: 'project-1' },
      }),
    );
  });

  it('updates report scalar fields and soft deletes reports', async () => {
    vi.mocked(prisma.supervision_daily_reports.update).mockResolvedValue(
      reportRow({ attachments: '["/new.png"]' }) as never,
    );

    const result = await SupervisionReportService.updateReport('report-1', {
      attachments: ['/new.png'],
      coordinationNeeded: '',
      progressPercent: 120,
      reportDate: '2026-01-04',
      reporter: 'Bob',
      workContent: 'Updated',
    });
    await SupervisionReportService.deleteReport('report-1');

    expect(result.attachments).toEqual(['/new.png']);
    expect(prisma.supervision_daily_reports.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attachments: '["/new.png"]',
        coordinationNeeded: null,
        progressPercent: 100,
        reporter: 'Bob',
        workContent: 'Updated',
      }),
      include: expect.any(Object),
      where: { id: 'report-1', isDeleted: false },
    });
    expect(prisma.supervision_daily_reports.update).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: { id: 'report-1' },
    });
  });
});
