import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetrologyCalibrationPlanImportService } from '~/modules/metrology/calibration-plan/metrology-calibration-plan-import.service';
import { MetrologyCalibrationPlanQueryService } from '~/modules/metrology/calibration-plan/metrology-calibration-plan-query.service';
import { MetrologyCalibrationPlanService } from '~/modules/metrology/calibration-plan/metrology-calibration-plan.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    metrology_calibration_plans: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock(
  '~/modules/metrology/calibration-plan/metrology-calibration-plan-import.service',
  () => ({
    MetrologyCalibrationPlanImportService: {
      importItems: vi.fn(),
    },
  }),
);

const instrument = {
  id: 'm-1',
  instrumentCode: 'M-001',
  instrumentName: 'Gauge',
  model: 'G-1',
  orderNo: 1,
  usingUnit: 'QA',
};

const plan = {
  actualDate: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  id: 'plan-1',
  instrument,
  instrumentId: 'm-1',
  planDay: 15,
  planMonth: 6,
  plannedDate: new Date('2026-06-15T00:00:00.000Z'),
  planYear: 2026,
  remark: 'remark',
  status: 'PLANNED',
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

describe('metrologyCalibrationPlanService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates, updates, and soft deletes calibration plans', async () => {
    vi.mocked(prisma.metrology_calibration_plans.create).mockResolvedValue(
      plan as never,
    );
    vi.mocked(prisma.metrology_calibration_plans.update).mockResolvedValue(
      plan as never,
    );

    await MetrologyCalibrationPlanService.create(
      {
        instrumentId: 'm-1',
        planDay: 15,
        planMonth: 6,
        planYear: 2026,
      },
      'admin',
    );
    await MetrologyCalibrationPlanService.updateById(
      'plan-1',
      {
        instrumentId: 'm-1',
        planDay: 16,
        planMonth: 6,
        planYear: 2026,
      },
      'admin',
    );
    await MetrologyCalibrationPlanService.deleteById('plan-1', 'admin');

    expect(prisma.metrology_calibration_plans.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdBy: 'admin',
        instrumentId: 'm-1',
        planDay: 15,
        planMonth: 6,
        planYear: 2026,
        updatedBy: 'admin',
      }),
    });
    expect(prisma.metrology_calibration_plans.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: expect.objectContaining({
        instrumentId: 'm-1',
        planDay: 16,
        updatedBy: 'admin',
      }),
    });
    expect(prisma.metrology_calibration_plans.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: { isDeleted: true, updatedBy: 'admin' },
    });
  });

  it('rejects invalid calibration mutation payload and exposes template rows', () => {
    expect(() =>
      MetrologyCalibrationPlanService.buildMutationPayload({
        instrumentId: '',
        planDay: 1,
        planMonth: 1,
        planYear: 2026,
      }),
    ).toThrow('计量器具不能为空');
    expect(() =>
      MetrologyCalibrationPlanService.buildMutationPayload({
        instrumentId: 'm-1',
        planDay: 31,
        planMonth: 2,
        planYear: 2026,
      }),
    ).toThrow('计划日期无效');
    expect(MetrologyCalibrationPlanService.getTemplateRows()[0]).toEqual(
      expect.objectContaining({ 设备名称: '里氏硬度计' }),
    );
  });

  it('lists plans and builds annual grid', async () => {
    vi.mocked(prisma.metrology_calibration_plans.findMany).mockResolvedValue([
      plan,
    ] as never);
    vi.mocked(prisma.metrology_calibration_plans.count).mockResolvedValue(
      1 as never,
    );

    const list = await MetrologyCalibrationPlanQueryService.getList({
      page: 2,
      pageSize: 500,
      sortBy: 'instrumentCode',
      sortOrder: 'desc',
      year: 2026,
    });
    const grid = await MetrologyCalibrationPlanQueryService.getAnnualGrid({
      year: 2026,
    });

    expect(list.total).toBe(1);
    expect(list.items[0]).toEqual(expect.objectContaining({ id: 'plan-1' }));
    expect(grid[0]?.months['6']).toEqual(
      expect.objectContaining({ id: 'plan-1', planDay: 15 }),
    );
    expect(prisma.metrology_calibration_plans.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 100, take: 100 }),
    );
  });

  it('builds overview summary and delegates import', async () => {
    vi.mocked(prisma.metrology_calibration_plans.findMany).mockResolvedValue([
      {
        ...plan,
        actualDate: new Date('2026-06-14T00:00:00.000Z'),
        status: 'COMPLETED',
      },
      { ...plan, id: 'plan-2', status: 'PLANNED' },
    ] as never);
    vi.mocked(
      MetrologyCalibrationPlanImportService.importItems,
    ).mockResolvedValue({
      successCount: 2,
    } as never);

    const overview = await MetrologyCalibrationPlanService.getOverview({
      month: 6,
      year: 2026,
    });
    const importResult = await MetrologyCalibrationPlanService.importItems(
      2026,
      [{ instrumentCode: 'M-001' }],
      'admin',
      'plans.xlsx',
    );

    expect(overview.summary.totalCount).toBe(2);
    expect(overview.summary.completedCount).toBe(1);
    expect(importResult).toEqual({ successCount: 2 });
    expect(
      MetrologyCalibrationPlanImportService.importItems,
    ).toHaveBeenCalledWith(
      2026,
      [{ instrumentCode: 'M-001' }],
      'admin',
      'plans.xlsx',
    );
  });
});
