import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyGovernedProjectNameByTable,
  upsertPlanningProjectByWorkOrder,
} from '~/modules/planning/planning-project';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    work_orders: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('~/utils/governed-write', () => ({
  buildGovernedWriteFieldsForTable: vi.fn(
    (_table: string, data: Record<string, unknown>) => ({
      projectId: data.projectName ? 'project-canon' : undefined,
    }),
  ),
}));

describe('planning project helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns missing work order when bootstrap source does not exist', async () => {
    vi.mocked(prisma.work_orders.findUnique).mockResolvedValue(null);

    const result = await upsertPlanningProjectByWorkOrder({
      createProject: vi.fn(),
      findExistingByWorkOrderNumber: vi.fn(),
      restoreProjectById: vi.fn(),
      workOrderNumber: 'WO-1',
    });

    expect(result).toEqual({ code: 'MISSING_WORK_ORDER' });
  });

  it('returns conflict for active existing planning project', async () => {
    vi.mocked(prisma.work_orders.findUnique).mockResolvedValue({
      projectName: 'Project A',
    } as never);

    const result = await upsertPlanningProjectByWorkOrder({
      createProject: vi.fn(),
      findExistingByWorkOrderNumber: vi.fn().mockResolvedValue({
        id: 'existing-1',
        isDeleted: false,
      }),
      restoreProjectById: vi.fn(),
      workOrderNumber: 'WO-1',
    });

    expect(result).toEqual({ code: 'CONFLICT' });
  });

  it('restores soft-deleted existing planning project', async () => {
    vi.mocked(prisma.work_orders.findUnique).mockResolvedValue({
      projectName: 'Project A',
    } as never);
    const restoreProjectById = vi.fn().mockResolvedValue({ id: 'restored-1' });

    const result = await upsertPlanningProjectByWorkOrder({
      createProject: vi.fn(),
      findExistingByWorkOrderNumber: vi.fn().mockResolvedValue({
        id: 'deleted-1',
        isDeleted: true,
      }),
      restoreProjectById,
      workOrderNumber: 'WO-1',
    });

    expect(result).toEqual({
      code: 'RESTORED',
      data: { id: 'restored-1' },
    });
    expect(restoreProjectById).toHaveBeenCalledWith('deleted-1');
  });

  it('creates planning project from work order project name or work order number fallback', async () => {
    vi.mocked(prisma.work_orders.findUnique).mockResolvedValue({
      projectName: '',
    } as never);
    const createProject = vi.fn().mockResolvedValue({ id: 'created-1' });

    const result = await upsertPlanningProjectByWorkOrder({
      createProject,
      findExistingByWorkOrderNumber: vi.fn().mockResolvedValue(null),
      restoreProjectById: vi.fn(),
      workOrderNumber: 'WO-1',
    });

    expect(result).toEqual({
      code: 'CREATED',
      data: { id: 'created-1' },
    });
    expect(createProject).toHaveBeenCalledWith({
      projectName: 'WO-1',
      workOrderNumber: 'WO-1',
    });
  });

  it('applies governed project name fields for planning project tables', () => {
    const result = applyGovernedProjectNameByTable('bom_projects', {
      projectName: 'Project A',
    });

    expect(result).toEqual({
      projectId: 'project-canon',
      projectName: 'Project A',
    });
  });
});
