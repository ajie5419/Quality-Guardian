import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '~/modules/inspection/inspection-record-create.post.service';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { SystemService } from '~/modules/system/system.service';

const mocks = vi.hoisted(() => ({
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

vi.mock('~/modules/inspection/inspection.service', () => ({
  InspectionService: { create: vi.fn() },
}));

vi.mock('~/modules/system/system.service', () => ({
  SystemService: {
    isInspectionManualCreateEnabled: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('~/modules/system-log/audit-log', () => ({
  recordBusinessAuditLog: vi.fn(),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

vi.mock('~/utils/business-error', () => ({
  BusinessError: class BusinessError extends Error {
    code: string;
    httpStatus: number;
    constructor(code: string, message?: string, httpStatus = 400) {
      super(message || code);
      this.code = code;
      this.httpStatus = httpStatus;
    }
  },
  businessErrorResponse: vi
    .fn()
    .mockImplementation((_event: any, error: any) => ({
      statusCode: error.httpStatus,
      message: error.message,
    })),
  legacyErrorToBusinessError: vi.fn(),
}));

vi.mock('~/utils/response', () => ({
  badRequestResponse: vi.fn().mockReturnValue({ statusCode: 400 }),
  internalServerErrorResponse: vi
    .fn()
    .mockImplementation((_event: any, msg: string) => ({
      statusCode: 500,
      message: msg,
    })),
  useResponseSuccess: vi.fn().mockImplementation((data: any) => ({
    data,
    statusCode: 200,
  })),
}));

const outcome = {
  replayed: false,
  resourceId: 'rec-1',
  resourceType: 'inspections',
  response: { id: 'rec-1', projectName: 'P1' },
  responseStatus: 200,
};

describe('inspection-record-create.post.handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getHeader.mockReturnValue('client-key-001');
    mocks.readBody.mockResolvedValue({ workOrderNumber: 'WO-1' });
    (SystemService.isInspectionManualCreateEnabled as any).mockResolvedValue(
      true,
    );
    (InspectionService.create as any).mockResolvedValue({
      id: 'rec-1',
      projectName: 'P1',
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
  });

  it('rejects a missing Idempotency-Key before occupying a claim', async () => {
    mocks.getHeader.mockReturnValue(null);
    const { badRequestResponse } = await import('~/utils/response');
    await handler({} as any);
    expect(badRequestResponse).toHaveBeenCalledOnce();
    expect(mocks.withRequestIdempotency).not.toHaveBeenCalled();
  });

  it('creates the record inside the claim transaction and audits once', async () => {
    const { useResponseSuccess } = await import('~/utils/response');
    await handler({} as any);
    expect(mocks.withRequestIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({
        actorKey: 'user:user-1',
        operationKey: 'qms.inspection-record.create',
      }),
    );
    expect(InspectionService.create).toHaveBeenCalledWith(
      expect.objectContaining({ workOrderNumber: 'WO-1' }),
      expect.anything(),
      expect.objectContaining({ id: 'user-1' }),
    );
    expect(recordBusinessAuditLog).toHaveBeenCalledTimes(1);
    expect(useResponseSuccess).toHaveBeenCalledWith(outcome.response);
  });

  it('does not re-run the create or audit on a replay', async () => {
    mocks.withRequestIdempotency.mockResolvedValue({
      ...outcome,
      replayed: true,
    });
    await handler({} as any);
    expect(InspectionService.create).not.toHaveBeenCalled();
    expect(recordBusinessAuditLog).not.toHaveBeenCalled();
  });

  it('rejects with a business error when manual creation is disabled', async () => {
    (SystemService.isInspectionManualCreateEnabled as any).mockResolvedValue(
      false,
    );
    const { businessErrorResponse, legacyErrorToBusinessError } = await import(
      '~/utils/business-error'
    );
    (legacyErrorToBusinessError as any).mockImplementation(
      (error: unknown) => error,
    );
    await handler({} as any);
    expect(InspectionService.create).not.toHaveBeenCalled();
    expect(businessErrorResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ code: 'INSPECTION_MANUAL_CREATE_DISABLED' }),
    );
  });

  it('returns internalServerErrorResponse for unknown errors', async () => {
    mocks.withRequestIdempotency.mockRejectedValue(
      new Error('something broke'),
    );
    const { legacyErrorToBusinessError } = await import(
      '~/utils/business-error'
    );
    (legacyErrorToBusinessError as any).mockReturnValue(null);
    const { internalServerErrorResponse } = await import('~/utils/response');
    await handler({} as any);
    expect(internalServerErrorResponse).toHaveBeenCalledWith(
      expect.anything(),
      'Failed to create inspection record',
    );
  });
});
