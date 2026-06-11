import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '~/modules/metrology/calibration-plan/metrology-calibration-plan.service',
  () => ({
    MetrologyCalibrationPlanService: { updateById: vi.fn() },
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
  readBody: vi
    .fn()
    .mockResolvedValue({ instrumentId: 'inst-1', planYear: 2026 }),
  getRouterParam: vi.fn(() => 'plan-1'),
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaUniqueConstraintError: vi.fn().mockReturnValue(false),
}));

vi.mock('~/utils/api-logger', () => ({ logApiError: vi.fn() }));

vi.mock('~/utils/response', () => ({
  badRequestResponse: vi.fn((_event, msg) => ({ error: msg })),
  conflictResponse: vi.fn((_event, msg) => ({ error: msg })),
  internalServerErrorResponse: vi.fn((_event, msg) => ({ error: msg })),
  notFoundResponse: vi.fn((_event, msg) => ({ error: msg })),
  useResponseSuccess: vi.fn((data) => ({ data })),
}));

function event() {
  return { context: {} } as any;
}

describe('calibration-plan-id.put.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update calibration plan and record audit log', async () => {
    const { MetrologyCalibrationPlanService } = await import(
      '~/modules/metrology/calibration-plan/metrology-calibration-plan.service'
    );
    const { recordBusinessAuditLog } = await import(
      '~/modules/system-log/audit-log'
    );
    const { useResponseSuccess } = await import('~/utils/response');
    const { getRouterParam } = await import('h3');

    (getRouterParam as any).mockReturnValue('plan-1');
    (MetrologyCalibrationPlanService.updateById as any).mockResolvedValue({
      instrumentId: 'inst-1',
      planYear: 2026,
      planMonth: 6,
    });

    const handlerModule = await import(
      '~/modules/metrology/calibration-plan-id.put.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(MetrologyCalibrationPlanService.updateById).toHaveBeenCalledWith(
      'plan-1',
      { instrumentId: 'inst-1', planYear: 2026 },
      'admin',
    );
    expect(recordBusinessAuditLog).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        userId: 'user-1',
        action: 'UPDATE',
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
      '~/modules/metrology/calibration-plan-id.put.service'
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
    (MetrologyCalibrationPlanService.updateById as any).mockRejectedValue(
      new Error('Record to update not found'),
    );

    const handlerModule = await import(
      '~/modules/metrology/calibration-plan-id.put.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(notFoundResponse).toHaveBeenCalledWith(
      expect.any(Object),
      '校准计划不存在',
    );
    expect(result).toEqual({ error: '校准计划不存在' });
  });

  it('should return conflict on unique constraint error', async () => {
    const { MetrologyCalibrationPlanService } = await import(
      '~/modules/metrology/calibration-plan/metrology-calibration-plan.service'
    );
    const { conflictResponse } = await import('~/utils/response');
    const { isPrismaUniqueConstraintError } = await import(
      '~/utils/prisma-error'
    );
    const { getRouterParam } = await import('h3');

    (getRouterParam as any).mockReturnValue('plan-1');
    (MetrologyCalibrationPlanService.updateById as any).mockRejectedValue(
      new Error('unique'),
    );
    (isPrismaUniqueConstraintError as any).mockReturnValue(true);

    const handlerModule = await import(
      '~/modules/metrology/calibration-plan-id.put.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(conflictResponse).toHaveBeenCalledWith(
      expect.any(Object),
      '该月份计划已存在',
    );
    expect(result).toEqual({ error: '该月份计划已存在' });
  });

  it('should return badRequest on validation error', async () => {
    const { getRouterParam, readBody: _readBody } = await import('h3');
    const { MetrologyCalibrationPlanService } = await import(
      '~/modules/metrology/calibration-plan/metrology-calibration-plan.service'
    );
    const { badRequestResponse: _badRequestResponse } = await import(
      '~/utils/response'
    );

    (getRouterParam as any).mockReturnValue('plan-1');
    (MetrologyCalibrationPlanService.updateById as any).mockRejectedValue(
      new Error('计划年份不能为空'),
    );

    const handlerModule = await import(
      '~/modules/metrology/calibration-plan-id.put.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(result).toEqual({ error: '计划年份不能为空' });
  });
});
