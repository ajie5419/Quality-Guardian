import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetrologyCalibrationPlanImportService } from '~/modules/metrology/calibration-plan/metrology-calibration-plan-import.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    measuring_instruments: {
      findFirst: vi.fn(),
    },
    metrology_calibration_plans: {
      upsert: vi.fn(),
    },
  },
}));

describe('metrologyCalibrationPlanImportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('imports monthly calibration plans for known instruments', async () => {
    vi.mocked(prisma.measuring_instruments.findFirst).mockResolvedValue({
      id: 'm-1',
    } as never);
    vi.mocked(prisma.metrology_calibration_plans.upsert).mockResolvedValue(
      {} as never,
    );

    const result = await MetrologyCalibrationPlanImportService.importItems(
      2026,
      [
        {
          编号: 'M-001',
          设备名称: 'Gauge',
          '1月': '15',
          month2: '20',
        },
      ],
      'admin',
      'plans.xlsx',
    );

    expect(result).toEqual({
      errorCount: 0,
      errors: [],
      failedCount: 0,
      successCount: 2,
      totalCount: 1,
    });
    expect(prisma.measuring_instruments.findFirst).toHaveBeenCalledWith({
      where: { instrumentCode: 'M-001', isDeleted: false },
      select: { id: true },
    });
    expect(prisma.metrology_calibration_plans.upsert).toHaveBeenNthCalledWith(
      1,
      {
        where: {
          instrumentId_planYear_planMonth: {
            instrumentId: 'm-1',
            planMonth: 1,
            planYear: 2026,
          },
        },
        update: expect.objectContaining({
          actualDate: null,
          isDeleted: false,
          planDay: 15,
          remark: null,
          sourceFileName: 'plans.xlsx',
          updatedBy: 'admin',
        }),
        create: expect.objectContaining({
          createdBy: 'admin',
          instrumentId: 'm-1',
          planDay: 15,
          planMonth: 1,
          planYear: 2026,
          sourceFileName: 'plans.xlsx',
          updatedBy: 'admin',
        }),
      },
    );
  });

  it('skips blank/header/no-month rows and records validation errors', async () => {
    vi.mocked(prisma.measuring_instruments.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'm-2' } as never);

    const result = await MetrologyCalibrationPlanImportService.importItems(
      2026,
      [
        {},
        { 编号: '编号', 设备名称: '设备名称' },
        { 设备名称: 'Gauge', '1月': '15' },
        { 编号: 'M-404', 设备名称: 'Gauge', '1月': '15' },
        { 编号: 'M-002', 设备名称: 'Gauge' },
        { 编号: 'M-002', 设备名称: 'Gauge', '2月': '31' },
        { 编号: 'M-002', 设备名称: 'Gauge', '3月': 'bad' },
      ],
    );

    expect(result.successCount).toBe(0);
    expect(result.failedCount).toBe(4);
    expect(result.errors).toEqual([
      { row: 4, reason: '编号不能为空' },
      { row: 5, reason: '编号未在台账中找到' },
      { row: 7, reason: '2月计划日期无效' },
      { row: 8, reason: '3月计划日期无效' },
    ]);
    expect(prisma.metrology_calibration_plans.upsert).not.toHaveBeenCalled();
  });

  it('records invalid planned dates that fail calendar validation', async () => {
    vi.mocked(prisma.measuring_instruments.findFirst).mockResolvedValue({
      id: 'm-1',
    } as never);

    const result = await MetrologyCalibrationPlanImportService.importItems(
      2026,
      [{ 编号: 'M-001', 设备名称: 'Gauge', '2月': '31' }],
    );

    expect(result.successCount).toBe(0);
    expect(result.errors).toEqual([{ row: 2, reason: '2月计划日期无效' }]);
  });
});
