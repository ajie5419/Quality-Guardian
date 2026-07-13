import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/modules/work-order', () => ({
  WorkOrderService: {
    findQualityLossReference: vi.fn(),
  },
}));

vi.mock('~/modules/planning', () => ({
  PlanningBomService: {
    findPartReference: vi.fn(),
  },
}));

describe('resolveManualQualityLossContext', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns canonical work order, project and BOM part context', async () => {
    const { WorkOrderService } = await import('~/modules/work-order');
    const { PlanningBomService } = await import('~/modules/planning');
    const { resolveManualQualityLossContext } = await import(
      './quality-loss-manual-context'
    );
    vi.mocked(WorkOrderService.findQualityLossReference).mockResolvedValue({
      projectId: 'project-1',
      projectName: '1000t 架桥机',
      workOrderNumber: 'WO-468624',
    });
    vi.mocked(PlanningBomService.findPartReference).mockResolvedValue({
      partId: 'part-1',
      part_name: '主梁',
    });

    await expect(
      resolveManualQualityLossContext({
        partId: 'part-1',
        partName: '主梁',
        workOrderNumber: 'WO-468624',
      }),
    ).resolves.toEqual({
      partId: 'part-1',
      partName: '主梁',
      projectId: 'project-1',
      projectName: '1000t 架桥机',
      workOrderNumber: 'WO-468624',
    });
  });

  it('rejects an unknown work order', async () => {
    const { WorkOrderService } = await import('~/modules/work-order');
    const { resolveManualQualityLossContext } = await import(
      './quality-loss-manual-context'
    );
    vi.mocked(WorkOrderService.findQualityLossReference).mockResolvedValue(
      null,
    );

    await expect(
      resolveManualQualityLossContext({
        partName: '主梁',
        workOrderNumber: 'WO-MISSING',
      }),
    ).rejects.toMatchObject({
      code: 'WORK_ORDER_NOT_FOUND',
      httpStatus: 404,
    });
  });

  it('rejects a part outside the selected work order BOM', async () => {
    const { WorkOrderService } = await import('~/modules/work-order');
    const { PlanningBomService } = await import('~/modules/planning');
    const { resolveManualQualityLossContext } = await import(
      './quality-loss-manual-context'
    );
    vi.mocked(WorkOrderService.findQualityLossReference).mockResolvedValue({
      projectId: 'project-1',
      projectName: 'Project',
      workOrderNumber: 'WO-1',
    });
    vi.mocked(PlanningBomService.findPartReference).mockResolvedValue(null);

    await expect(
      resolveManualQualityLossContext({
        partName: '其他工单部件',
        workOrderNumber: 'WO-1',
      }),
    ).rejects.toMatchObject({ code: 'BOM_PART_NOT_FOUND' });
  });

  it('rejects a work order without a project name', async () => {
    const { WorkOrderService } = await import('~/modules/work-order');
    const { resolveManualQualityLossContext } = await import(
      './quality-loss-manual-context'
    );
    vi.mocked(WorkOrderService.findQualityLossReference).mockResolvedValue({
      projectId: null,
      projectName: null,
      workOrderNumber: 'WO-1',
    });

    await expect(
      resolveManualQualityLossContext({
        partName: '主梁',
        workOrderNumber: 'WO-1',
      }),
    ).rejects.toMatchObject({ code: 'WORK_ORDER_PROJECT_MISSING' });
  });
});
