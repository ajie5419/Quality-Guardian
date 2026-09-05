import { beforeEach, describe, expect, it, vi } from 'vitest';

import handler from './after-sales-create.post.service';

const mocks = vi.hoisted(() => ({
  applyPostCommit: vi.fn(),
  create: vi.fn(),
  getHeader: vi.fn(),
  readBody: vi.fn(),
  withRequestIdempotency: vi.fn(),
}));

vi.mock('h3', () => ({
  defineEventHandler: (fn: unknown) => fn,
  getHeader: mocks.getHeader,
  readBody: mocks.readBody,
  setResponseStatus: vi.fn(),
}));

vi.mock('~/utils/prisma', () => ({ default: {} }));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn().mockReturnValue({ id: 'user-1' }),
}));

vi.mock('~/modules/idempotency', () => ({
  buildRequestFingerprint: vi.fn(() => 'fp'),
  normalizeIdempotencyKey: (value: unknown) =>
    typeof value === 'string' && value.length >= 8 ? value : null,
  withRequestIdempotency: mocks.withRequestIdempotency,
}));

vi.mock('~/utils/business-error', () => {
  class MockBusinessError extends Error {
    constructor(
      public code: string,
      message: string,
      public httpStatus: number,
    ) {
      super(message);
    }
  }
  return {
    BusinessError: MockBusinessError,
    businessErrorResponse: vi.fn((_event, error: MockBusinessError) => ({
      code: error.code,
      statusCode: error.httpStatus,
    })),
    isBusinessError: vi.fn(
      (error: unknown) => error instanceof MockBusinessError,
    ),
  };
});

vi.mock('~/utils/response', () => ({
  badRequestResponse: vi.fn().mockReturnValue({ statusCode: 400 }),
  internalServerErrorResponse: vi.fn().mockReturnValue({ statusCode: 500 }),
  useResponseSuccess: vi.fn((data: unknown) => ({ data, statusCode: 200 })),
}));

vi.mock('~/utils/api-logger', () => ({ logApiError: vi.fn() }));

vi.mock('./after-sales-route.service', () => ({
  AfterSalesRouteService: {
    applyCreatePostCommit: mocks.applyPostCommit,
    create: mocks.create,
  },
}));

const outcome = {
  replayed: false,
  resourceId: 'as-1',
  resourceType: 'after_sales',
  response: { id: 'as-1', projectName: 'P1' },
  responseStatus: 200,
};

describe('after-sales create handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getHeader.mockReturnValue('client-key-001');
    mocks.readBody.mockResolvedValue({ workOrderNumber: 'WO-1' });
    mocks.create.mockResolvedValue({ id: 'as-1', projectName: 'P1' });
    mocks.applyPostCommit.mockResolvedValue(undefined);
    mocks.withRequestIdempotency.mockImplementation(
      async (options: {
        run: (tx: unknown) => Promise<{
          resourceId: string;
          resourceType: string;
          response: unknown;
        }>;
      }) => {
        const result = await options.run({});
        return {
          replayed: false,
          resourceId: result.resourceId,
          resourceType: result.resourceType,
          response: result.response,
          responseStatus: 200,
        };
      },
    );
  });

  it('rejects a missing Idempotency-Key before occupying a claim', async () => {
    mocks.getHeader.mockReturnValue(null);
    const { badRequestResponse } = await import('~/utils/response');
    await handler({} as never);
    expect(badRequestResponse).toHaveBeenCalledOnce();
    expect(mocks.withRequestIdempotency).not.toHaveBeenCalled();
  });

  it('creates inside the claim transaction and applies post-commit effects once', async () => {
    const { useResponseSuccess } = await import('~/utils/response');
    await handler({} as never);
    expect(mocks.withRequestIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({
        actorKey: 'user:user-1',
        operationKey: 'qms.after-sales.create',
      }),
    );
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.applyPostCommit).toHaveBeenCalledTimes(1);
    expect(useResponseSuccess).toHaveBeenCalledWith(outcome.response);
  });

  it('skips post-commit effects on a replay', async () => {
    mocks.withRequestIdempotency.mockResolvedValue({
      ...outcome,
      replayed: true,
    });
    await handler({} as never);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.applyPostCommit).not.toHaveBeenCalled();
  });

  it('propagates a 409 conflict error', async () => {
    const { BusinessError } = await import('~/utils/business-error');
    mocks.withRequestIdempotency.mockRejectedValue(
      new BusinessError('IDEMPOTENCY_REQUEST_IN_PROGRESS', 'in progress', 409),
    );
    const { businessErrorResponse } = await import('~/utils/business-error');
    await handler({} as never);
    expect(businessErrorResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS' }),
    );
  });
});
