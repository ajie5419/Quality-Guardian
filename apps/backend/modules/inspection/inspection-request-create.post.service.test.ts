import { beforeEach, describe, expect, it, vi } from 'vitest';

import handler, {
  inspectionRequestCreateV2Handler,
} from './inspection-request-create.post.service';
import { validateInspectionRequestCreateV2Body } from './inspection-request-create.schema';

const mocks = vi.hoisted(() => ({
  applyPostCommit: vi.fn(),
  createInTransaction: vi.fn(),
  getHeader: vi.fn(),
  prepareCreate: vi.fn(),
  readBody: vi.fn(),
  withRequestIdempotency: vi.fn(),
}));

vi.mock('h3', () => ({
  defineEventHandler: (fn: (...args: unknown[]) => unknown) => fn,
  getHeader: mocks.getHeader,
  readBody: mocks.readBody,
  setResponseStatus: vi.fn(),
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn().mockReturnValue({ id: 'user-1' }),
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
      message: error.message,
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

vi.mock('~/modules/idempotency', () => ({
  buildRequestFingerprint: vi.fn(() => 'fp'),
  normalizeIdempotencyKey: (value: unknown) =>
    typeof value === 'string' && value.length >= 8 ? value : null,
  withRequestIdempotency: mocks.withRequestIdempotency,
}));

vi.mock('./inspection-request-create.schema', () => ({
  inspectionRequestCreateV2BodySchema: { parse: vi.fn((body) => body) },
  validateInspectionRequestCreateV2Body: vi
    .fn()
    .mockReturnValue({ isValid: true }),
}));

vi.mock('./inspection-request-create.service', () => ({
  InspectionRequestCreateService: {
    applyCreateRequestPostCommitEffects: mocks.applyPostCommit,
    createRequestInTransaction: mocks.createInTransaction,
    prepareCreateRequest: mocks.prepareCreate,
  },
}));

const outcome = {
  replayed: false,
  resourceId: 'request-1',
  resourceType: 'qms_inspection_requests',
  response: { id: 'request-1', requestNo: 'IR-20260820-1' },
  responseStatus: 200,
};

describe('inspection request create handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getHeader.mockReturnValue('client-key-001');
    mocks.readBody.mockResolvedValue({ workOrderNumber: 'WO-1' });
    mocks.prepareCreate.mockResolvedValue({ payload: { attachments: [] } });
    mocks.createInTransaction.mockResolvedValue({ id: 'request-1' });
    mocks.applyPostCommit.mockResolvedValue({
      id: 'request-1',
      requestNo: 'IR-20260820-1',
    });
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
    vi.mocked(validateInspectionRequestCreateV2Body).mockReturnValue({
      attachments: [],
      isValid: true,
      workOrderNumber: 'WO-1',
      workOrderNumbers: ['WO-1'],
    });
  });

  it('retires the name-only legacy write path', async () => {
    await expect(handler({} as never)).resolves.toMatchObject({
      code: 'INSPECTION_REQUEST_V2_REQUIRED',
      statusCode: 410,
    });
    expect(mocks.withRequestIdempotency).not.toHaveBeenCalled();
  });

  it('rejects a missing Idempotency-Key before occupying a claim', async () => {
    mocks.getHeader.mockReturnValue(null);
    const { badRequestResponse } = await import('~/utils/response');
    await inspectionRequestCreateV2Handler({} as never);
    expect(badRequestResponse).toHaveBeenCalledOnce();
    expect(mocks.withRequestIdempotency).not.toHaveBeenCalled();
  });

  it('creates through the idempotency claim and applies post-commit effects once', async () => {
    const { useResponseSuccess } = await import('~/utils/response');
    await inspectionRequestCreateV2Handler({} as never);

    expect(mocks.prepareCreate).toHaveBeenCalledWith(
      expect.anything(),
      'V2',
      false,
    );
    expect(mocks.withRequestIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({
        actorKey: 'user:user-1',
        operationKey: 'qms.inspection-request.create',
      }),
    );
    expect(mocks.createInTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.applyPostCommit).toHaveBeenCalledTimes(1);
    expect(useResponseSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'request-1' }),
    );
  });

  it('does not re-run the create or post-commit effects on a replay', async () => {
    mocks.withRequestIdempotency.mockResolvedValue({
      ...outcome,
      replayed: true,
    });
    await inspectionRequestCreateV2Handler({} as never);
    expect(mocks.createInTransaction).not.toHaveBeenCalled();
    expect(mocks.applyPostCommit).not.toHaveBeenCalled();
  });

  it('rejects incomplete V2 payloads before creation', async () => {
    const { validateInspectionRequestCreateV2Body } = await import(
      './inspection-request-create.schema'
    );
    vi.mocked(validateInspectionRequestCreateV2Body).mockReturnValue({
      isValid: false,
    } as never);

    const { badRequestResponse } = await import('~/utils/response');
    await inspectionRequestCreateV2Handler({} as never);
    expect(badRequestResponse).toHaveBeenCalledOnce();
    expect(mocks.withRequestIdempotency).not.toHaveBeenCalled();
  });

  it('maps a 409 conflict error from the idempotency utility', async () => {
    const { BusinessError } = await import('~/utils/business-error');
    mocks.withRequestIdempotency.mockRejectedValue(
      new BusinessError('IDEMPOTENCY_KEY_REUSED', 'key reused', 409),
    );
    const { businessErrorResponse } = await import('~/utils/business-error');
    await inspectionRequestCreateV2Handler({} as never);
    expect(businessErrorResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REUSED' }),
    );
  });
});
