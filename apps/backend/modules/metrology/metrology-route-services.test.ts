import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  badRequestResponse,
  conflictResponse,
  getCurrentUser,
  getRequiredRouterParam,
  getRouterParam,
  internalServerErrorResponse,
  isPrismaNotFoundError,
  isPrismaUniqueConstraintError,
  logApiError,
  readBody,
  recordBusinessAuditLog,
  useResponseSuccess,
  createCalibrationPlan,
  deleteCalibrationPlan,
  importCalibrationPlans,
  updateCalibrationPlan,
  createMetrology,
  importMetrology,
  updateMetrology,
  notFoundResponse,
} = vi.hoisted(() => ({
  badRequestResponse: vi.fn((_event, message) => ({ message, type: 'bad' })),
  conflictResponse: vi.fn((_event, message) => ({
    message,
    type: 'conflict',
  })),
  createCalibrationPlan: vi.fn(),
  createMetrology: vi.fn(),
  deleteCalibrationPlan: vi.fn(),
  getCurrentUser: vi.fn(),
  getRequiredRouterParam: vi.fn(),
  getRouterParam: vi.fn(),
  importCalibrationPlans: vi.fn(),
  importMetrology: vi.fn(),
  internalServerErrorResponse: vi.fn((_event, message) => ({
    message,
    type: 'internal',
  })),
  isPrismaNotFoundError: vi.fn(),
  isPrismaUniqueConstraintError: vi.fn(),
  logApiError: vi.fn(),
  notFoundResponse: vi.fn((_event, message) => ({
    message,
    type: 'not_found',
  })),
  readBody: vi.fn(),
  recordBusinessAuditLog: vi.fn(),
  updateCalibrationPlan: vi.fn(),
  updateMetrology: vi.fn(),
  useResponseSuccess: vi.fn((data) => ({ data, type: 'success' })),
}));

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getRouterParam,
  readBody,
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser,
}));

vi.mock('~/utils/route-param', () => ({
  getRequiredRouterParam,
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError,
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaNotFoundError,
  isPrismaUniqueConstraintError,
}));

vi.mock('~/utils/response', () => ({
  badRequestResponse,
  conflictResponse,
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
}));

vi.mock('~/modules/system-log/audit-log', () => ({
  recordBusinessAuditLog,
}));

vi.mock('~/modules/metrology/metrology.service', () => ({
  MetrologyService: {
    create: createMetrology,
    importItems: importMetrology,
    updateById: updateMetrology,
  },
}));

vi.mock(
  '~/modules/metrology/calibration-plan/metrology-calibration-plan.service',
  () => ({
    MetrologyCalibrationPlanService: {
      create: createCalibrationPlan,
      deleteById: deleteCalibrationPlan,
      importItems: importCalibrationPlans,
      updateById: updateCalibrationPlan,
    },
  }),
);

function event() {
  return { context: {} } as any;
}

describe('metrology route service handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockReturnValue({ id: 'u-1', username: 'admin' });
    getRequiredRouterParam.mockReturnValue('m-1');
    getRouterParam.mockReturnValue('plan-1');
    isPrismaNotFoundError.mockReturnValue(false);
    isPrismaUniqueConstraintError.mockReturnValue(false);
  });

  it('creates metrology instrument, records audit, and returns created data', async () => {
    const mod = await import('~/modules/metrology/metrology-create.post.service');
    const handler = mod.default;
    readBody.mockResolvedValue({ instrumentCode: 'M-001' });
    createMetrology.mockResolvedValue({
      id: 'm-1',
      instrumentCode: 'M-001',
      instrumentName: 'Gauge',
    });

    const result = await handler(event());

    expect(result).toEqual({
      data: { id: 'm-1', instrumentCode: 'M-001', instrumentName: 'Gauge' },
      type: 'success',
    });
    expect(createMetrology).toHaveBeenCalledWith(
      { instrumentCode: 'M-001' },
      'admin',
    );
    expect(recordBusinessAuditLog).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        action: 'CREATE',
        targetId: 'm-1',
        targetType: 'metrology',
      }),
    );
  });

  it('maps metrology create validation and duplicate errors', async () => {
    const mod = await import('~/modules/metrology/metrology-create.post.service');
    const handler = mod.default;
    readBody.mockResolvedValue({});
    createMetrology.mockRejectedValueOnce(new Error('编号不能为空'));

    expect(await handler(event())).toEqual({
      message: '编号不能为空',
      type: 'bad',
    });

    createMetrology.mockRejectedValueOnce(new Error('duplicate'));
    isPrismaUniqueConstraintError.mockReturnValueOnce(true);
    expect(await handler(event())).toEqual({
      message: '编号已存在',
      type: 'conflict',
    });
  });

  it('updates metrology instrument and maps missing route id, not found, and duplicate errors', async () => {
    const mod = await import('~/modules/metrology/metrology-id.put.service');
    const handler = mod.default;
    getRequiredRouterParam.mockReturnValueOnce({ message: 'missing id' });
    expect(await handler(event())).toEqual({ message: 'missing id' });

    getRequiredRouterParam.mockReturnValue('m-1');
    readBody.mockResolvedValue({ instrumentCode: 'M-002' });
    updateMetrology.mockResolvedValue({
      instrumentCode: 'M-002',
      instrumentName: 'Gauge',
    });
    expect(await handler(event())).toEqual({ data: null, type: 'success' });

    updateMetrology.mockRejectedValueOnce(new Error('not found'));
    isPrismaNotFoundError.mockReturnValueOnce(true);
    expect(await handler(event())).toEqual({
      message: '计量器具不存在',
      type: 'not_found',
    });

    updateMetrology.mockRejectedValueOnce(new Error('duplicate'));
    isPrismaUniqueConstraintError.mockReturnValueOnce(true);
    expect(await handler(event())).toEqual({
      message: '编号已存在',
      type: 'conflict',
    });
  });

  it('imports metrology rows and rejects empty imports', async () => {
    const mod = await import('~/modules/metrology/metrology-import.post.service');
    const handler = mod.default;
    readBody.mockResolvedValueOnce({ items: [] });
    expect(await handler(event())).toEqual({
      message: 'No metrology data to import',
      type: 'bad',
    });

    readBody.mockResolvedValueOnce({
      fileName: 'metrology.xlsx',
      items: [{ instrumentCode: 'M-001' }],
    });
    importMetrology.mockResolvedValue({ successCount: 1, totalCount: 1 });
    expect(await handler(event())).toEqual({
      data: { successCount: 1, totalCount: 1 },
      type: 'success',
    });
    expect(importMetrology).toHaveBeenCalledWith(
      [{ instrumentCode: 'M-001' }],
      'admin',
      'metrology.xlsx',
    );
  });

  it('creates calibration plan and maps validation or duplicate errors', async () => {
    const mod = await import(
      '~/modules/metrology/calibration-plan-create.post.service'
    );
    const handler = mod.default;
    readBody.mockResolvedValue({ instrumentId: 'm-1' });
    createCalibrationPlan.mockResolvedValue({
      id: 'plan-1',
      instrumentId: 'm-1',
      planMonth: 6,
      planYear: 2026,
    });
    expect(await handler(event())).toEqual({
      data: {
        id: 'plan-1',
        instrumentId: 'm-1',
        planMonth: 6,
        planYear: 2026,
      },
      type: 'success',
    });

    createCalibrationPlan.mockRejectedValueOnce(new Error('计划日期无效'));
    expect(await handler(event())).toEqual({
      message: '计划日期无效',
      type: 'bad',
    });

    createCalibrationPlan.mockRejectedValueOnce(new Error('duplicate'));
    isPrismaUniqueConstraintError.mockReturnValueOnce(true);
    expect(await handler(event())).toEqual({
      message: '该月份计划已存在',
      type: 'conflict',
    });
  });

  it('updates and deletes calibration plans with id validation and not-found mapping', async () => {
    const updateMod = await import(
      '~/modules/metrology/calibration-plan-id.put.service'
    );
    const deleteMod = await import(
      '~/modules/metrology/calibration-plan-id.delete.service'
    );
    const updateHandler = updateMod.default;
    const deleteHandler = deleteMod.default;

    getRouterParam.mockReturnValueOnce('');
    expect(await updateHandler(event())).toEqual({
      message: '计划ID不能为空',
      type: 'bad',
    });

    getRouterParam.mockReturnValue('plan-1');
    readBody.mockResolvedValue({ planDay: 15 });
    updateCalibrationPlan.mockResolvedValue({
      instrumentId: 'm-1',
      planMonth: 6,
      planYear: 2026,
    });
    expect(await updateHandler(event())).toEqual({
      data: null,
      type: 'success',
    });

    updateCalibrationPlan.mockRejectedValueOnce(
      new Error('Record to update not found'),
    );
    expect(await updateHandler(event())).toEqual({
      message: '校准计划不存在',
      type: 'not_found',
    });

    deleteCalibrationPlan.mockResolvedValue({
      instrumentId: 'm-1',
      planMonth: 6,
      planYear: 2026,
    });
    expect(await deleteHandler(event())).toEqual({
      data: null,
      type: 'success',
    });

    deleteCalibrationPlan.mockRejectedValueOnce(
      new Error('Record to update not found'),
    );
    expect(await deleteHandler(event())).toEqual({
      message: '校准计划不存在',
      type: 'not_found',
    });
  });

  it('imports calibration plans and validates import year', async () => {
    const mod = await import(
      '~/modules/metrology/calibration-plan-import.post.service'
    );
    const handler = mod.default;
    readBody.mockResolvedValueOnce({ items: [], year: 1999 });
    expect(await handler(event())).toEqual({
      message: '计划年份无效',
      type: 'bad',
    });

    readBody.mockResolvedValueOnce({
      fileName: 'plans.xlsx',
      items: [{ instrumentCode: 'M-001' }],
      year: 2026,
    });
    importCalibrationPlans.mockResolvedValue({
      successCount: 1,
      totalCount: 1,
    });
    expect(await handler(event())).toEqual({
      data: { successCount: 1, totalCount: 1 },
      type: 'success',
    });
    expect(importCalibrationPlans).toHaveBeenCalledWith(
      2026,
      [{ instrumentCode: 'M-001' }],
      'admin',
      'plans.xlsx',
    );
  });
});
