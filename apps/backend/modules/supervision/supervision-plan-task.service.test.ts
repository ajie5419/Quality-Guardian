import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupervisionPlanTaskImportService } from '~/modules/supervision/supervision-plan-task-import.service';
import { syncSupervisionProjectProgress } from '~/modules/supervision/supervision-plan-task-progress';
import { SupervisionPlanTaskService } from '~/modules/supervision/supervision-plan-task.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    supervision_plan_tasks: {
      aggregate: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    supervision_projects: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/utils/canonical-master-data', () => ({
  MasterDataGovernanceKernel: {
    resolveCanonicalNamesByIds: vi
      .fn()
      .mockResolvedValue(new Map([['project-canon', 'Canonical Project']])),
  },
}));

vi.mock('~/modules/supervision/supervision-plan-task-progress', () => ({
  syncSupervisionProjectProgress: vi.fn(),
}));

vi.mock('~/modules/supervision/supervision-plan-task-import.service', () => ({
  SupervisionPlanTaskImportService: {
    importPlanTasks: vi.fn(),
  },
}));

function task(overrides: Record<string, unknown>) {
  return {
    actualEndAt: null,
    actualStartAt: null,
    completedQuantity: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    durationDays: null,
    durationText: '',
    id: 'task-1',
    isSummary: false,
    lastReportAt: null,
    lastReportId: null,
    outlineLevel: 1,
    outlineNumber: '1',
    parentId: null,
    plannedEndAt: null,
    plannedQuantity: 1,
    plannedStartAt: null,
    predecessorText: null,
    progressPercent: 0,
    projectId: 'project-1',
    quantityUnit: 'item',
    resourceName: null,
    riskLevel: 'NORMAL',
    riskReason: null,
    sortOrder: 1,
    sourceFileName: null,
    sourceFileUrl: null,
    taskName: 'Task',
    taskNo: '1',
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    weight: 1,
    ...overrides,
  };
}

describe('supervisionPlanTaskService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('classifies deadline board tasks and resolves canonical project names', async () => {
    const now = new Date();
    const delayedEnd = new Date(now);
    delayedEnd.setDate(delayedEnd.getDate() - 1);
    const dueSoonEnd = new Date(now);
    dueSoonEnd.setDate(dueSoonEnd.getDate() + 2);
    const riskEnd = new Date(now);
    riskEnd.setDate(riskEnd.getDate() + 20);

    vi.mocked(prisma.supervision_projects.findMany).mockResolvedValue([
      {
        id: 'project-1',
        projectId: 'project-canon',
        projectName: 'Stored Project',
        supplierId: 'supplier-canon',
        supplierName: 'Stored Supplier',
      },
    ] as never);
    vi.mocked(prisma.supervision_plan_tasks.findMany).mockResolvedValue([
      task({ id: 'delayed', plannedEndAt: delayedEnd }),
      task({ id: 'due', plannedEndAt: dueSoonEnd }),
      task({ id: 'risk', plannedEndAt: riskEnd, riskLevel: 'RISK' }),
    ] as never);

    const result = await SupervisionPlanTaskService.deadlineBoard({
      dueSoonDays: 7,
    });

    expect(result.summary).toEqual({
      delayedCount: 1,
      dueSoonCount: 1,
      healthyPercent: 0,
      riskCount: 1,
      totalProjects: 1,
    });
    expect(result.delayed[0]?.projectName).toBe('Canonical Project');
    expect(prisma.supervision_plan_tasks.findMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        isSummary: false,
        projectId: { in: ['project-1'] },
        status: { notIn: ['DONE'] },
      },
      orderBy: { plannedEndAt: 'asc' },
    });
  });

  it('creates child tasks, promotes parent to summary, and returns refreshed list', async () => {
    vi.mocked(prisma.supervision_plan_tasks.aggregate).mockResolvedValue({
      _max: { sortOrder: 4 },
    } as never);
    vi.mocked(prisma.supervision_plan_tasks.findMany).mockResolvedValue([
      task({ id: 'parent', isSummary: true, taskName: 'Parent' }),
      task({ id: 'child', parentId: 'parent', taskName: 'Child' }),
    ] as never);
    vi.mocked(prisma.supervision_plan_tasks.create).mockResolvedValue(
      {} as never,
    );
    vi.mocked(prisma.supervision_plan_tasks.update).mockResolvedValue(
      {} as never,
    );
    vi.mocked(prisma.supervision_plan_tasks.findFirst).mockResolvedValue(
      task({ id: 'parent', isSummary: false, outlineLevel: 1 }) as never,
    );

    const result = await SupervisionPlanTaskService.createTask('project-1', {
      parentId: 'parent',
      plannedQuantity: 3,
      taskName: 'Child',
      taskNo: '1.1',
    });

    expect(prisma.supervision_plan_tasks.update).toHaveBeenCalledWith({
      data: { isSummary: true },
      where: { id: 'parent' },
    });
    expect(prisma.supervision_plan_tasks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        outlineLevel: 2,
        parentId: 'parent',
        plannedQuantity: 3,
        projectId: 'project-1',
        sortOrder: 5,
        taskName: 'Child',
      }),
    });
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('lists plan tasks as tree and weighted summary', async () => {
    vi.mocked(prisma.supervision_plan_tasks.findMany).mockResolvedValue([
      task({
        id: 'parent',
        isSummary: true,
        plannedQuantity: 2,
        progressPercent: 0,
        taskName: 'Parent',
        weight: 2,
      }),
      task({
        id: 'child',
        parentId: 'parent',
        plannedQuantity: 2,
        progressPercent: 50,
        taskName: 'Child',
        weight: 2,
      }),
    ] as never);

    const result = await SupervisionPlanTaskService.listPlanTasks('project-1');

    expect(result.items).toHaveLength(2);
    expect(result.tree[0]?.children?.[0]?.id).toBe('child');
    expect(result.summary.total).toBe(1);
    expect(prisma.supervision_plan_tasks.findMany).toHaveBeenCalledWith({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      where: { isDeleted: false, projectId: 'project-1' },
    });
  });

  it('delegates plan task import with bound list callback', async () => {
    vi.mocked(
      SupervisionPlanTaskImportService.importPlanTasks,
    ).mockResolvedValue({
      items: [],
      summary: {
        delayed: 0,
        done: 0,
        dueSoon: 0,
        inProgress: 0,
        notStarted: 0,
        progressPercent: 0,
        total: 0,
      },
      tree: [],
    } as never);

    await SupervisionPlanTaskService.importPlanTasks('project-1', {
      rows: [],
    });

    expect(
      SupervisionPlanTaskImportService.importPlanTasks,
    ).toHaveBeenCalledWith('project-1', { rows: [] }, expect.any(Function));
  });

  it('updates task fields, promotes new parent, syncs progress, and returns refreshed list', async () => {
    vi.mocked(prisma.supervision_plan_tasks.findFirst).mockResolvedValue(
      task({ id: 'parent', isSummary: false, outlineLevel: 1 }) as never,
    );
    vi.mocked(prisma.supervision_plan_tasks.update).mockResolvedValue(
      {} as never,
    );
    vi.mocked(prisma.supervision_plan_tasks.findMany).mockResolvedValue([
      task({ id: 'task-1', parentId: 'parent', taskName: 'Updated' }),
    ] as never);

    await SupervisionPlanTaskService.updateTask('project-1', 'task-1', {
      parentId: 'parent',
      progressPercent: 120,
      quantityUnit: '',
      riskLevel: ' risk ',
      taskName: ' Updated ',
      weight: 0,
    });

    expect(prisma.supervision_plan_tasks.update).toHaveBeenCalledWith({
      data: { isSummary: true },
      where: { id: 'parent' },
    });
    expect(prisma.supervision_plan_tasks.update).toHaveBeenCalledWith({
      where: { id: 'task-1', projectId: 'project-1' },
      data: expect.objectContaining({
        outlineLevel: 2,
        parentId: 'parent',
        progressPercent: 100,
        quantityUnit: '项',
        riskLevel: 'RISK',
        taskName: 'Updated',
        weight: 1,
      }),
    });
    expect(syncSupervisionProjectProgress).toHaveBeenCalledWith('project-1');
  });

  it('deletes a task in transaction and demotes parent when no siblings remain', async () => {
    const tx = {
      supervision_plan_tasks: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(
          task({
            id: 'child',
            outlineLevel: 2,
            parentId: 'parent',
          }),
        ),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(tx));
    vi.mocked(prisma.supervision_plan_tasks.findMany).mockResolvedValue(
      [] as never,
    );

    await SupervisionPlanTaskService.deleteTask('project-1', 'child');

    expect(tx.supervision_plan_tasks.updateMany).toHaveBeenCalledWith({
      data: { outlineLevel: 2, parentId: 'parent' },
      where: { isDeleted: false, parentId: 'child', projectId: 'project-1' },
    });
    expect(tx.supervision_plan_tasks.update).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: { id: 'child' },
    });
    expect(tx.supervision_plan_tasks.update).toHaveBeenCalledWith({
      data: { isSummary: false },
      where: { id: 'parent' },
    });
  });

  it('reorders tasks and recomputes summary flags in transaction', async () => {
    const tx = {
      supervision_plan_tasks: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'parent', parentId: null },
          { id: 'child', parentId: 'parent' },
          { id: 'orphan', parentId: null },
        ]),
        update: vi.fn(),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(tx));
    vi.mocked(prisma.supervision_plan_tasks.findMany).mockResolvedValue(
      [] as never,
    );

    await SupervisionPlanTaskService.reorderTasks('project-1', [
      { id: 'child', outlineLevel: 2, parentId: 'parent', sortOrder: 1 },
    ]);

    expect(tx.supervision_plan_tasks.update).toHaveBeenCalledWith({
      data: { sortOrder: 1, parentId: 'parent', outlineLevel: 2 },
      where: { id: 'child', projectId: 'project-1' },
    });
    expect(tx.supervision_plan_tasks.update).toHaveBeenCalledWith({
      data: { isSummary: true },
      where: { id: 'parent' },
    });
    expect(tx.supervision_plan_tasks.update).toHaveBeenCalledWith({
      data: { isSummary: false },
      where: { id: 'orphan' },
    });
    expect(syncSupervisionProjectProgress).toHaveBeenCalledWith('project-1');
  });
});
