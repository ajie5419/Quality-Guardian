import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/modules/metrology/metrology.service', () => ({
  MetrologyService: { updateById: vi.fn() },
}));

vi.mock('~/modules/system-log/audit-log', () => ({
  recordBusinessAuditLog: vi.fn(),
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn(() => ({ id: 'user-1', username: 'admin' })),
}));

vi.mock('h3', () => ({
  defineEventHandler: vi.fn((handler) => handler),
  readBody: vi.fn().mockResolvedValue({ instrumentCode: 'M-002' }),
  getRouterParam: vi.fn(() => 'm-1'),
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaNotFoundError: vi.fn().mockReturnValue(false),
  isPrismaUniqueConstraintError: vi.fn().mockReturnValue(false),
}));

vi.mock('~/utils/api-logger', () => ({ logApiError: vi.fn() }));

vi.mock('~/utils/route-param', () => ({
  getRequiredRouterParam: vi.fn(() => 'm-1'),
}));

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

describe('metrology-id.put.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update metrology and record audit log', async () => {
    const { MetrologyService } = await import(
      '~/modules/metrology/metrology.service'
    );
    const { recordBusinessAuditLog } = await import(
      '~/modules/system-log/audit-log'
    );
    const { useResponseSuccess } = await import('~/utils/response');
    const { getRequiredRouterParam } = await import('~/utils/route-param');

    (getRequiredRouterParam as any).mockReturnValue('m-1');
    (MetrologyService.updateById as any).mockResolvedValue({
      instrumentCode: 'M-002',
      instrumentName: 'Gauge',
    });

    const handlerModule = await import(
      '~/modules/metrology/metrology-id.put.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(MetrologyService.updateById).toHaveBeenCalledWith(
      'm-1',
      { instrumentCode: 'M-002' },
      'admin',
    );
    expect(recordBusinessAuditLog).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        userId: 'user-1',
        action: 'UPDATE',
        targetType: 'metrology',
        targetId: 'm-1',
      }),
    );
    expect(useResponseSuccess).toHaveBeenCalledWith(null);
    expect(result).toEqual({ data: null });
  });

  it('should return notFound when record does not exist', async () => {
    const { MetrologyService } = await import(
      '~/modules/metrology/metrology.service'
    );
    const { notFoundResponse } = await import('~/utils/response');
    const { isPrismaNotFoundError } = await import('~/utils/prisma-error');
    const { getRequiredRouterParam } = await import('~/utils/route-param');

    (getRequiredRouterParam as any).mockReturnValue('m-1');
    (MetrologyService.updateById as any).mockRejectedValue(
      new Error('not found'),
    );
    (isPrismaNotFoundError as any).mockReturnValue(true);

    const handlerModule = await import(
      '~/modules/metrology/metrology-id.put.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(notFoundResponse).toHaveBeenCalledWith(
      expect.any(Object),
      '计量器具不存在',
    );
    expect(result).toEqual({ error: '计量器具不存在' });
  });

  it('should return conflict on unique constraint error', async () => {
    const { MetrologyService } = await import(
      '~/modules/metrology/metrology.service'
    );
    const { conflictResponse } = await import('~/utils/response');
    const { isPrismaNotFoundError, isPrismaUniqueConstraintError } =
      await import('~/utils/prisma-error');
    const { getRequiredRouterParam } = await import('~/utils/route-param');

    (getRequiredRouterParam as any).mockReturnValue('m-1');
    (isPrismaNotFoundError as any).mockReturnValue(false);
    (MetrologyService.updateById as any).mockRejectedValue(new Error('unique'));
    (isPrismaUniqueConstraintError as any).mockReturnValue(true);

    const handlerModule = await import(
      '~/modules/metrology/metrology-id.put.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(conflictResponse).toHaveBeenCalledWith(
      expect.any(Object),
      '编号已存在',
    );
    expect(result).toEqual({ error: '编号已存在' });
  });

  it('should return badRequest on validation error', async () => {
    const { getRequiredRouterParam } = await import('~/utils/route-param');
    const { badRequestResponse: _badRequestResponse } = await import(
      '~/utils/response'
    );

    (getRequiredRouterParam as any).mockReturnValue('m-1');

    const { readBody } = await import('h3');
    (readBody as any).mockRejectedValue(new Error('编号不能为空'));

    const handlerModule = await import(
      '~/modules/metrology/metrology-id.put.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(result).toEqual({ error: '编号不能为空' });
  });

  it('should return error when id is missing', async () => {
    const { getRequiredRouterParam } = await import('~/utils/route-param');

    (getRequiredRouterParam as any).mockReturnValue({
      message: '缺少计量器具ID',
    });

    const handlerModule = await import(
      '~/modules/metrology/metrology-id.put.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(result).toEqual({ message: '缺少计量器具ID' });
  });
});
