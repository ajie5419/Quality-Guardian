import { describe, expect, it } from 'vitest';
import {
  buildPlanTaskTree,
  calculatePlanTaskStatus,
  calculateQuantityProgress,
  mapPlanTask,
  normalizeDate,
  normalizeDurationDays,
  normalizeIssueStatus,
  normalizePercent,
  normalizePositiveQuantity,
  normalizeProjectStatus,
  normalizeProjectType,
  normalizeQuantity,
  normalizeText,
  parseList,
  rollupSummaryTasks,
  stringifyList,
  summarizePlanTasks,
} from '~/modules/supervision/supervision-shared';

function row(overrides: Record<string, unknown>) {
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

describe('supervision shared helpers', () => {
  it('normalizes primitive supervision values', () => {
    expect(normalizeText('  hello  ')).toBe('hello');
    expect(normalizeDate('2026-01-01')?.toISOString()).toContain('2026-01-01');
    expect(normalizePercent(120)).toBe(100);
    expect(normalizePercent('bad', 7)).toBe(7);
    expect(normalizeQuantity('3.5')).toBe(3.5);
    expect(normalizeQuantity('bad', 2)).toBe(2);
    expect(normalizePositiveQuantity(0, 4)).toBe(4);
    expect(normalizeDurationDays('3 days')).toBe(3);
    expect(calculateQuantityProgress(3, 6)).toBe(50);
    expect(stringifyList(['a', 'b'])).toBe('["a","b"]');
    expect(parseList('["a","b"]')).toEqual(['a', 'b']);
    expect(parseList('not json')).toEqual([]);
    expect(normalizeProjectStatus('completed')).toBe('COMPLETED');
    expect(normalizeProjectType('mold')).toBe('MOLD');
    expect(normalizeIssueStatus('closed')).toBe('CLOSED');
  });

  it('calculates and maps plan task status from live fields', () => {
    expect(
      calculatePlanTaskStatus({
        actualEndAt: new Date('2026-01-02T00:00:00.000Z'),
        progressPercent: 100,
      }),
    ).toBe('DONE');
    expect(
      calculatePlanTaskStatus({
        progressPercent: 20,
        riskLevel: 'RISK',
      }),
    ).toBe('RISK');

    const task = mapPlanTask(
      row({
        completedQuantity: 5,
        plannedQuantity: 10,
        quantityUnit: '',
        riskLevel: '',
      }),
    );

    expect(task).toEqual(
      expect.objectContaining({
        completedQuantity: 5,
        progressPercent: 50,
        quantityUnit: '项',
        riskLevel: 'NORMAL',
      }),
    );
  });

  it('summarizes leaf tasks with weights and status buckets', () => {
    const summary = summarizePlanTasks([
      mapPlanTask(
        row({
          completedQuantity: 1,
          id: 'done',
          plannedQuantity: 1,
          progressPercent: 100,
          weight: 2,
        }),
      ),
      mapPlanTask(
        row({
          completedQuantity: 1,
          id: 'doing',
          plannedQuantity: 2,
          progressPercent: 50,
          weight: 1,
        }),
      ),
      mapPlanTask(row({ id: 'new', progressPercent: 0, weight: 1 })),
    ]);

    expect(summary).toEqual({
      delayed: 0,
      done: 1,
      dueSoon: 0,
      inProgress: 1,
      notStarted: 1,
      progressPercent: 63,
      total: 3,
    });
  });

  it('rolls up summary task dates, quantities, status, and progress from children', () => {
    const tasks = [
      mapPlanTask(
        row({
          id: 'parent',
          isSummary: true,
          outlineLevel: 1,
          taskName: 'Parent',
        }),
      ),
      mapPlanTask(
        row({
          actualEndAt: new Date('2026-01-03T00:00:00.000Z'),
          actualStartAt: new Date('2026-01-01T00:00:00.000Z'),
          completedQuantity: 1,
          id: 'child-1',
          parentId: 'parent',
          plannedEndAt: new Date('2026-01-03T00:00:00.000Z'),
          plannedQuantity: 1,
          plannedStartAt: new Date('2026-01-01T00:00:00.000Z'),
          progressPercent: 100,
        }),
      ),
      mapPlanTask(
        row({
          actualEndAt: new Date('2026-01-05T00:00:00.000Z'),
          actualStartAt: new Date('2026-01-02T00:00:00.000Z'),
          completedQuantity: 1,
          id: 'child-2',
          parentId: 'parent',
          plannedEndAt: new Date('2026-01-05T00:00:00.000Z'),
          plannedQuantity: 1,
          plannedStartAt: new Date('2026-01-02T00:00:00.000Z'),
          progressPercent: 100,
        }),
      ),
    ];

    rollupSummaryTasks(tasks);

    expect(tasks[0]).toEqual(
      expect.objectContaining({
        actualEndAt: '2026-01-05T00:00:00.000Z',
        actualStartAt: '2026-01-01T00:00:00.000Z',
        completedQuantity: 2,
        durationDays: 5,
        plannedEndAt: '2026-01-05T00:00:00.000Z',
        plannedQuantity: 2,
        plannedStartAt: '2026-01-01T00:00:00.000Z',
        progressPercent: 100,
        status: 'DONE',
      }),
    );
  });

  it('builds a plan task tree from parent relationships', () => {
    const tree = buildPlanTaskTree([
      mapPlanTask(row({ id: 'parent', taskName: 'Parent' })),
      mapPlanTask(row({ id: 'child', parentId: 'parent', taskName: 'Child' })),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.children[0]?.id).toBe('child');
  });
});
