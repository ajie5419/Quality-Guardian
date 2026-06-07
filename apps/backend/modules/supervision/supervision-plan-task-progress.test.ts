import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calcProjectStatusFromProgress,
  syncSupervisionProjectProgress,
} from '~/modules/supervision/supervision-plan-task-progress';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    supervision_plan_tasks: {
      findMany: vi.fn(),
    },
    supervision_projects: {
      update: vi.fn(),
    },
  },
}));

function task(overrides: Record<string, unknown>) {
  return {
    actualEndAt: null,
    actualStartAt: null,
    completedQuantity: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    id: 'task-1',
    isSummary: false,
    plannedEndAt: null,
    plannedQuantity: 1,
    plannedStartAt: null,
    progressPercent: 0,
    projectId: 'project-1',
    status: 'NOT_STARTED',
    taskName: 'Task',
    taskNo: '1',
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    weight: 1,
    ...overrides,
  };
}

describe('supervision plan task progress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('derives project status from progress boundaries', () => {
    expect(calcProjectStatusFromProgress(0)).toBeUndefined();
    expect(calcProjectStatusFromProgress(1)).toBe('IN_PROGRESS');
    expect(calcProjectStatusFromProgress(99)).toBe('IN_PROGRESS');
    expect(calcProjectStatusFromProgress(100)).toBe('COMPLETED');
    expect(calcProjectStatusFromProgress(120)).toBe('COMPLETED');
  });

  it('syncs project progress using prisma when no transaction client is passed', async () => {
    vi.mocked(prisma.supervision_plan_tasks.findMany).mockResolvedValue([
      task({ completedQuantity: 1, plannedQuantity: 2, progressPercent: 50 }),
      task({ completedQuantity: 1, plannedQuantity: 1, progressPercent: 100 }),
    ] as never);

    await syncSupervisionProjectProgress('project-1');

    expect(prisma.supervision_plan_tasks.findMany).toHaveBeenCalledWith({
      where: { isDeleted: false, isSummary: false, projectId: 'project-1' },
    });
    expect(prisma.supervision_projects.update).toHaveBeenCalledWith({
      data: {
        progressPercent: 75,
        status: 'IN_PROGRESS',
      },
      where: { id: 'project-1' },
    });
  });

  it('uses the provided transaction client', async () => {
    const tx = {
      supervision_plan_tasks: {
        findMany: vi.fn().mockResolvedValue([
          task({
            completedQuantity: 1,
            plannedQuantity: 1,
            progressPercent: 100,
          }),
        ]),
      },
      supervision_projects: {
        update: vi.fn(),
      },
    };

    await syncSupervisionProjectProgress('project-1', tx as any);

    expect(tx.supervision_projects.update).toHaveBeenCalledWith({
      data: {
        progressPercent: 100,
        status: 'COMPLETED',
      },
      where: { id: 'project-1' },
    });
    expect(prisma.supervision_projects.update).not.toHaveBeenCalled();
  });
});
