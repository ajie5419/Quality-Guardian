import { beforeEach, describe, expect, it, vi } from 'vitest';

import handler from './inspection-issue-create.post.service';

const mocks = vi.hoisted(() => ({
  auditLog: vi.fn(),
  createInTransaction: vi.fn(),
  getHeader: vi.fn(),
  readBody: vi.fn(),
  registerReferences: vi.fn(),
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

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    registerReferencesFromAttachments: mocks.registerReferences,
  },
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: { auditLog: mocks.auditLog },
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
    legacyErrorToBusinessError: vi.fn(() => null),
  };
});

vi.mock('~/utils/response', () => ({
  badRequestResponse: vi.fn().mockReturnValue({ statusCode: 400 }),
  conflictResponse: vi.fn().mockReturnValue({ statusCode: 409 }),
  internalServerErrorResponse: vi.fn().mockReturnValue({ statusCode: 500 }),
  useResponseSuccess: vi.fn((data: unknown) => ({ data, statusCode: 200 })),
}));

vi.mock('~/utils/api-logger', () => ({ logApiError: vi.fn() }));

vi.mock('./inspection-issue.schema', () => ({
  parseInspectionIssueCreateBody: vi.fn((body) => body),
}));

vi.mock('./inspection-issue-mutation.service', () => ({
  assertIssueCreateSourceContext: vi.fn(),
  createIssueWithSerialRetry: vi.fn(async (run: () => Promise<unknown>) =>
    run(),
  ),
  InspectionIssueMutationService: {
    createIssueInTransaction: mocks.createInTransaction,
  },
}));

const outcome = {
  replayed: false,
  resourceId: 'nc-1',
  resourceType: 'quality_records',
  response: { id: 'nc-1', nonConformanceNumber: 'NC-1', partName: '阀体' },
  responseStatus: 200,
};

describe('inspection issue (NC) create handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getHeader.mockReturnValue('client-key-001');
    mocks.readBody.mockResolvedValue({
      description: '气孔',
      inspectionId: 'ins-1',
      partName: '阀体',
    });
    mocks.createInTransaction.mockResolvedValue({
      ncNumber: 'NC-1',
      record: { id: 'nc-1', nonConformanceNumber: 'NC-1', partName: '阀体' },
    });
    mocks.registerReferences.mockResolvedValue(undefined);
    mocks.auditLog.mockResolvedValue(undefined);
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

  it('creates inside the claim transaction and audits only once', async () => {
    await handler({} as never);
    expect(mocks.withRequestIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({
        actorKey: 'user:user-1',
        operationKey: 'qms.inspection-nc.create',
      }),
    );
    expect(mocks.createInTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.registerReferences).toHaveBeenCalledTimes(1);
    expect(mocks.auditLog).toHaveBeenCalledTimes(1);
  });

  it('does not re-run the create or side effects on a replay', async () => {
    mocks.withRequestIdempotency.mockResolvedValue({
      ...outcome,
      replayed: true,
    });
    await handler({} as never);
    expect(mocks.createInTransaction).not.toHaveBeenCalled();
    expect(mocks.registerReferences).not.toHaveBeenCalled();
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });

  it('passes distinct keys through to the utility (new key allows a second NC)', async () => {
    await handler({} as never);
    mocks.getHeader.mockReturnValue('client-key-002');
    await handler({} as never);
    expect(mocks.withRequestIdempotency).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ idempotencyKey: 'client-key-001' }),
    );
    expect(mocks.withRequestIdempotency).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ idempotencyKey: 'client-key-002' }),
    );
  });
});
