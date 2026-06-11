import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/modules/metrology/metrology.service', () => ({
  MetrologyService: { importItems: vi.fn() },
}));

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

describe('metrology-import.post.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should import metrology items and record audit log', async () => {
    const { readBody } = await import('h3');
    const { MetrologyService } = await import(
      '~/modules/metrology/metrology.service'
    );
    const { recordBusinessAuditLog } = await import(
      '~/modules/system-log/audit-log'
    );
    const { useResponseSuccess } = await import('~/utils/response');

    (readBody as any).mockResolvedValue({
      fileName: 'metrology.xlsx',
      items: [{ instrumentCode: 'M-001' }],
    });
    (MetrologyService.importItems as any).mockResolvedValue({
      successCount: 1,
      totalCount: 1,
    });

    const handlerModule = await import(
      '~/modules/metrology/metrology-import.post.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(MetrologyService.importItems).toHaveBeenCalledWith(
      [{ instrumentCode: 'M-001' }],
      'admin',
      'metrology.xlsx',
    );
    expect(recordBusinessAuditLog).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        userId: 'user-1',
        action: 'CREATE',
        targetType: 'metrology',
        targetId: 'batch-import',
      }),
    );
    expect(useResponseSuccess).toHaveBeenCalledWith({
      successCount: 1,
      totalCount: 1,
    });
    expect(result).toEqual({
      data: { successCount: 1, totalCount: 1 },
    });
  });

  it('should return badRequest when items is empty array', async () => {
    const { readBody } = await import('h3');
    const { badRequestResponse } = await import('~/utils/response');

    (readBody as any).mockResolvedValue({ items: [] });

    const handlerModule = await import(
      '~/modules/metrology/metrology-import.post.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(badRequestResponse).toHaveBeenCalledWith(
      expect.any(Object),
      'No metrology data to import',
    );
    expect(result).toEqual({ error: 'No metrology data to import' });
  });

  it('should return badRequest when items is missing', async () => {
    const { readBody } = await import('h3');
    const { badRequestResponse } = await import('~/utils/response');

    (readBody as any).mockResolvedValue({ fileName: 'test.xlsx' });

    const handlerModule = await import(
      '~/modules/metrology/metrology-import.post.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(badRequestResponse).toHaveBeenCalledWith(
      expect.any(Object),
      'No metrology data to import',
    );
    expect(result).toEqual({ error: 'No metrology data to import' });
  });

  it('should return badRequest when items is not an array', async () => {
    const { readBody } = await import('h3');
    const { badRequestResponse } = await import('~/utils/response');

    (readBody as any).mockResolvedValue({ items: 'invalid' });

    const handlerModule = await import(
      '~/modules/metrology/metrology-import.post.service'
    );
    const handler = handlerModule.default;
    const result = await handler(event());

    expect(badRequestResponse).toHaveBeenCalledWith(
      expect.any(Object),
      'No metrology data to import',
    );
    expect(result).toEqual({ error: 'No metrology data to import' });
  });
});
