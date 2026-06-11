import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '~/modules/metrology/calibration-plan/metrology-calibration-plan.service',
  () => ({
    MetrologyCalibrationPlanService: { importItems: vi.fn() },
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
  readBody: vi.fn(),
}));

vi.mock('~/utils/api-logger', () => ({ logApiError: vi.fn() }));

vi.mock('~/utils/response', () => ({
  badRequestResponse: vi.fn((_event, msg) => ({ error: msg })),
  internalServerErrorResponse: vi.fn((_event, msg) => ({ error: msg })),
  useResponseSuccess: vi.fn((data) => ({ data })),
}));

function event() {
  return { context: {} } as any;
}

describe('calibration-plan-import.post.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should import calibration plans and record audit log', async () => {
    const { readBody } = await import('h3');
    const { MetrologyCalibrationPlanService } = await import(
      '~/modules/metrology/calibration-plan/metrology-calibration-plan.service'
    );
    const { recordBusinessAuditLog } = await import(
      '~/modules/system-log/audit-log'
    );
    const { useResponseSuccess } = await import('~/utils/response');

    (readBody as any).mockResolvedValue({
      fileName: 'plans.xlsx',
      items: [{ instrumentCode: 'M-001' }],
      year: 2026,
    });
    (MetrologyCalibrationPlanService.importItems as any).mockResolvedValue({
      successCount: 2,
      totalCount: 2,
    });

    const handlerModule = await import(
      '~/modules/metrology/calibration-plan-import.post.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(MetrologyCalibrationPlanService.importItems).toHaveBeenCalledWith(
      2026,
      [{ instrumentCode: 'M-001' }],
      'admin',
      'plans.xlsx',
    );
    expect(recordBusinessAuditLog).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        userId: 'user-1',
        action: 'CREATE',
        targetType: 'metrology_calibration_plan',
        targetId: 'batch-import-2026',
      }),
    );
    expect(useResponseSuccess).toHaveBeenCalledWith({
      successCount: 2,
      totalCount: 2,
    });
    expect(result).toEqual({
      data: { successCount: 2, totalCount: 2 },
    });
  });

  it('should return badRequest when year is 1999', async () => {
    const { readBody } = await import('h3');
    const { badRequestResponse } = await import('~/utils/response');

    (readBody as any).mockResolvedValue({ items: [], year: 1999 });

    const handlerModule = await import(
      '~/modules/metrology/calibration-plan-import.post.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(badRequestResponse).toHaveBeenCalledWith(
      expect.any(Object),
      '计划年份无效',
    );
    expect(result).toEqual({ error: '计划年份无效' });
  });

  it('should return badRequest when year is 3000', async () => {
    const { readBody } = await import('h3');
    const { badRequestResponse } = await import('~/utils/response');

    (readBody as any).mockResolvedValue({ items: [], year: 3000 });

    const handlerModule = await import(
      '~/modules/metrology/calibration-plan-import.post.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(badRequestResponse).toHaveBeenCalledWith(
      expect.any(Object),
      '计划年份无效',
    );
    expect(result).toEqual({ error: '计划年份无效' });
  });

  it('should return badRequest when year is empty', async () => {
    const { readBody } = await import('h3');
    const { badRequestResponse } = await import('~/utils/response');

    (readBody as any).mockResolvedValue({ items: [] });

    const handlerModule = await import(
      '~/modules/metrology/calibration-plan-import.post.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(badRequestResponse).toHaveBeenCalledWith(
      expect.any(Object),
      '计划年份无效',
    );
    expect(result).toEqual({ error: '计划年份无效' });
  });
});
