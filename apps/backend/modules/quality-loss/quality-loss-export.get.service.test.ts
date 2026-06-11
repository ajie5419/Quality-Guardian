import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    quality_losses: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('~/modules/quality-loss/quality-loss-query', () => ({
  parseQualityLossCommonQuery: vi.fn((query: any) => query),
}));

vi.mock('~/modules/quality-loss/quality-loss.service', () => ({
  QualityLossService: {
    getLossSummary: vi.fn(),
  },
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn(() => ({
    id: 'user-1',
    userId: 'user-1',
    username: 'admin',
  })),
}));

vi.mock('~/utils/response', () => ({
  badRequestResponse: vi.fn((_event: any, message: string) => ({
    error: true,
    message,
  })),
  internalServerErrorResponse: vi.fn((_event: any, message: string) => ({
    error: true,
    message,
  })),
  useResponseSuccess: vi.fn((data: any) => ({ data, success: true })),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiDebug: vi.fn(),
  logApiError: vi.fn(),
  logApiWarn: vi.fn(),
}));

vi.mock('~/utils/define-validated-handler', () => ({
  defineValidatedHandler: vi.fn(
    (_schema: any, handler: any) => (event: any) =>
      handler(event, (event as any).query),
  ),
}));

describe('quality-loss-export.get.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return items and total within export limit', async () => {
    const { QualityLossService } = await import(
      '~/modules/quality-loss/quality-loss.service'
    );

    vi.mocked(QualityLossService.getLossSummary).mockResolvedValue([
      { id: 'ql-1', amount: 100 },
      { id: 'ql-2', amount: 200 },
    ] as never);

    const handlerModule = await import(
      '~/modules/quality-loss/quality-loss-export.get.service'
    );
    const handler = handlerModule.default;

    const result = await handler({ query: {} } as any);

    expect(result).toEqual({
      data: {
        items: [
          { id: 'ql-1', amount: 100 },
          { id: 'ql-2', amount: 200 },
        ],
        total: 2,
      },
      success: true,
    });
  });

  it('should return bad request when rows exceed limit', async () => {
    const { QualityLossService } = await import(
      '~/modules/quality-loss/quality-loss.service'
    );

    const largeList = Array.from({ length: 20_001 }, (_, i) => ({
      id: `ql-${i}`,
    }));
    vi.mocked(QualityLossService.getLossSummary).mockResolvedValue(
      largeList as never,
    );

    const handlerModule = await import(
      '~/modules/quality-loss/quality-loss-export.get.service'
    );
    const handler = handlerModule.default;

    const result = await handler({ query: {} } as any);

    expect(result).toEqual(expect.objectContaining({ error: true }));
  });

  it('should return internal error when service throws', async () => {
    const { QualityLossService } = await import(
      '~/modules/quality-loss/quality-loss.service'
    );

    vi.mocked(QualityLossService.getLossSummary).mockRejectedValue(
      new Error('db error'),
    );

    const handlerModule = await import(
      '~/modules/quality-loss/quality-loss-export.get.service'
    );
    const handler = handlerModule.default;

    const result = await handler({ query: {} } as any);

    expect(result).toEqual({
      error: true,
      message: 'Failed to export quality loss data',
    });
  });
});
