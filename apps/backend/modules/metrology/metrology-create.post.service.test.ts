import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/modules/metrology/metrology.service', () => ({
  MetrologyService: { create: vi.fn() },
}));

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
    .mockResolvedValue({ instrumentCode: 'M-001', instrumentName: 'Gauge' }),
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaUniqueConstraintError: vi.fn().mockReturnValue(false),
}));

vi.mock('~/utils/api-logger', () => ({ logApiError: vi.fn() }));

vi.mock('~/utils/response', () => ({
  badRequestResponse: vi.fn((_event, msg) => ({ error: msg })),
  conflictResponse: vi.fn((_event, msg) => ({ error: msg })),
  internalServerErrorResponse: vi.fn((_event, msg) => ({ error: msg })),
  useResponseSuccess: vi.fn((data) => ({ data })),
}));

function event() {
  return { context: {} } as any;
}

describe('metrology-create.post.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create metrology and record audit log', async () => {
    const { MetrologyService } = await import(
      '~/modules/metrology/metrology.service'
    );
    const { recordBusinessAuditLog } = await import(
      '~/modules/system-log/audit-log'
    );
    const { useResponseSuccess } = await import('~/utils/response');
    const { readBody } = await import('h3');

    (MetrologyService.create as any).mockResolvedValue({
      id: 'm-1',
      instrumentCode: 'M-001',
      instrumentName: 'Gauge',
    });

    const handlerModule = await import(
      '~/modules/metrology/metrology-create.post.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(readBody).toHaveBeenCalled();
    expect(MetrologyService.create).toHaveBeenCalledWith(
      { instrumentCode: 'M-001', instrumentName: 'Gauge' },
      'admin',
    );
    expect(recordBusinessAuditLog).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        userId: 'user-1',
        action: 'CREATE',
        targetType: 'metrology',
        targetId: 'm-1',
      }),
    );
    expect(useResponseSuccess).toHaveBeenCalledWith({
      id: 'm-1',
      instrumentCode: 'M-001',
      instrumentName: 'Gauge',
    });
    expect(result).toEqual({
      data: { id: 'm-1', instrumentCode: 'M-001', instrumentName: 'Gauge' },
    });
  });

  it('should return badRequest on validation error', async () => {
    const { MetrologyService } = await import(
      '~/modules/metrology/metrology.service'
    );
    const { badRequestResponse } = await import('~/utils/response');

    (MetrologyService.create as any).mockRejectedValue(
      new Error('编号不能为空'),
    );

    const handlerModule = await import(
      '~/modules/metrology/metrology-create.post.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(badRequestResponse).toHaveBeenCalledWith(
      expect.any(Object),
      '编号不能为空',
    );
    expect(result).toEqual({ error: '编号不能为空' });
  });

  it('should return conflict on unique constraint error', async () => {
    const { MetrologyService } = await import(
      '~/modules/metrology/metrology.service'
    );
    const { conflictResponse } = await import('~/utils/response');
    const { isPrismaUniqueConstraintError } = await import(
      '~/utils/prisma-error'
    );

    (MetrologyService.create as any).mockRejectedValue(new Error('unique'));
    (isPrismaUniqueConstraintError as any).mockReturnValue(true);

    const handlerModule = await import(
      '~/modules/metrology/metrology-create.post.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(conflictResponse).toHaveBeenCalledWith(
      expect.any(Object),
      '编号已存在',
    );
    expect(result).toEqual({ error: '编号已存在' });
  });

  it('should return internalServerError on generic error', async () => {
    const { MetrologyService } = await import(
      '~/modules/metrology/metrology.service'
    );
    const { internalServerErrorResponse } = await import('~/utils/response');
    const { isPrismaUniqueConstraintError } = await import(
      '~/utils/prisma-error'
    );

    (isPrismaUniqueConstraintError as any).mockReturnValue(false);
    (MetrologyService.create as any).mockRejectedValue(
      new Error('db connection failed'),
    );

    const handlerModule = await import(
      '~/modules/metrology/metrology-create.post.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(internalServerErrorResponse).toHaveBeenCalledWith(
      expect.any(Object),
      '新建计量器具失败',
    );
    expect(result).toEqual({ error: '新建计量器具失败' });
  });
});
