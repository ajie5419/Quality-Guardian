import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '~/modules/metrology/calibration-plan/metrology-calibration-plan.service',
  () => ({
    MetrologyCalibrationPlanService: { deleteById: vi.fn() },
  }),
);

vi.mock('~/modules/system-log/audit-log', () => ({
  recordBusinessAuditLog: vi.fn(),
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn(() => ({ id: 'user-1', username: 'admin' })),
}));

vi.mock('h3', () => ({
  defineEventHandler: vi.fn((handler) => handler),
  getRouterParam: vi.fn(() => 'plan-1'),
}));

vi.mock('~/utils/api-logger', () => ({ logApiError: vi.fn() }));

vi.mock('~/utils/response', () => ({
  badRequestResponse: vi.fn((_event, msg) => ({ error: msg })),
  internalServerErrorResponse: vi.fn((_event, msg) => ({ error: msg })),
  notFoundResponse: vi.fn((_event, msg) => ({ error: msg })),
  useResponseSuccess: vi.fn((data) => ({ data })),
}));

function event() {
  return { context: {} } as any;
}

describe('calibration-plan-id.delete.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delete calibration plan and record audit log', async () => {
    const { MetrologyCalibrationPlanService } = await import(
      '~/modules/metrology/calibration-plan/metrology-calibration-plan.service'
    );
    const { recordBusinessAuditLog } = await import(
      '~/modules/system-log/audit-log'
    );
    const { useResponseSuccess } = await import('~/utils/response');
    const { getRouterParam } = await import('h3');

    (getRouterParam as any).mockReturnValue('plan-1');
    (MetrologyCalibrationPlanService.deleteById as any).mockResolvedValue({
      instrumentId: 'i-1',
      planMonth: 6,
      planYear: 2026,
    });

    const handlerModule = await import(
      '~/modules/metrology/calibration-plan-id.delete.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(MetrologyCalibrationPlanService.deleteById).toHaveBeenCalledWith(
      'plan-1',
      'admin',
    );
    expect(recordBusinessAuditLog).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        userId: 'user-1',
        action: 'DELETE',
        targetType: 'metrology_calibration_plan',
        targetId: 'plan-1',
      }),
    );
    expect(useResponseSuccess).toHaveBeenCalledWith(null);
    expect(result).toEqual({ data: null });
  });

  it('should return badRequest when id is empty', async () => {
    const { getRouterParam } = await import('h3');
    const { badRequestResponse } = await import('~/utils/response');

    (getRouterParam as any).mockReturnValue('');

    const handlerModule = await import(
      '~/modules/metrology/calibration-plan-id.delete.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(badRequestResponse).toHaveBeenCalledWith(
      expect.any(Object),
      '计划ID不能为空',
    );
    expect(result).toEqual({ error: '计划ID不能为空' });
  });

  it('should return notFound when record does not exist', async () => {
    const { MetrologyCalibrationPlanService } = await import(
      '~/modules/metrology/calibration-plan/metrology-calibration-plan.service'
    );
    const { notFoundResponse } = await import('~/utils/response');
    const { getRouterParam } = await import('h3');

    (getRouterParam as any).mockReturnValue('plan-1');
    (MetrologyCalibrationPlanService.deleteById as any).mockRejectedValue(
      new Error('Record to update not found'),
    );

    const handlerModule = await import(
      '~/modules/metrology/calibration-plan-id.delete.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(notFoundResponse).toHaveBeenCalledWith(
      expect.any(Object),
      '校准计划不存在',
    );
    expect(result).toEqual({ error: '校准计划不存在' });
  });

  it('should return internalServerError on generic error', async () => {
    const { MetrologyCalibrationPlanService } = await import(
      '~/modules/metrology/calibration-plan/metrology-calibration-plan.service'
    );
    const { internalServerErrorResponse } = await import('~/utils/response');
    const { getRouterParam } = await import('h3');

    (getRouterParam as any).mockReturnValue('plan-1');
    (MetrologyCalibrationPlanService.deleteById as any).mockRejectedValue(
      new Error('db failure'),
    );

    const handlerModule = await import(
      '~/modules/metrology/calibration-plan-id.delete.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(internalServerErrorResponse).toHaveBeenCalledWith(
      expect.any(Object),
      '删除校准计划失败',
    );
    expect(result).toEqual({ error: '删除校准计划失败' });
  });
});
