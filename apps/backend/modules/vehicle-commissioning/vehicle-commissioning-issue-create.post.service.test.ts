import { beforeEach, describe, expect, it, vi } from 'vitest';

import handler from './vehicle-commissioning-issue-create.post.service';

const mocks = vi.hoisted(() => ({
  applyPostCommit: vi.fn(),
  createIssueFromBody: vi.fn(),
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

vi.mock('./vehicle-commissioning-issue-create-effects.service', () => ({
  applyIssueCreatePostCommit: mocks.applyPostCommit,
}));

vi.mock('./vehicle-commissioning.service', () => ({
  VehicleCommissioningService: {
    createIssueFromBody: mocks.createIssueFromBody,
  },
}));

const outcome = {
  replayed: false,
  resourceId: 'issue-1',
  resourceType: 'vehicle_commissioning_issues',
  response: { id: 'issue-1', description: '异响' },
  responseStatus: 200,
};

describe('vehicle-commissioning issue create handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getHeader.mockReturnValue('client-key-001');
    mocks.readBody.mockResolvedValue({ description: '异响' });
    mocks.createIssueFromBody.mockResolvedValue({
      id: 'issue-1',
      description: '异响',
    });
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
    await handler({} as never);
    expect(mocks.withRequestIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({
        actorKey: 'user:user-1',
        operationKey: 'qms.vehicle-commissioning-issue.create',
      }),
    );
    expect(mocks.createIssueFromBody).toHaveBeenCalledWith(
      expect.objectContaining({ description: '异响' }),
      'user-1',
      expect.anything(),
    );
    expect(mocks.applyPostCommit).toHaveBeenCalledTimes(1);
  });

  it('skips post-commit effects on a replay (no duplicate QualityLossIndex signal)', async () => {
    mocks.withRequestIdempotency.mockResolvedValue({
      ...outcome,
      replayed: true,
    });
    await handler({} as never);
    expect(mocks.createIssueFromBody).not.toHaveBeenCalled();
    expect(mocks.applyPostCommit).not.toHaveBeenCalled();
  });
});
