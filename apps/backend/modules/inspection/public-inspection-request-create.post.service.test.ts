import { beforeEach, describe, expect, it, vi } from 'vitest';
import { badRequestResponse, useResponseSuccess } from '~/utils/response';

import { InspectionRequestCreateService } from './inspection-request-create.service';
import handler, {
  publicInspectionRequestCreateV2Handler,
} from './public-inspection-request-create.post.service';

vi.mock('h3', () => ({
  defineEventHandler: (fn: (...args: unknown[]) => unknown) => fn,
  readBody: vi.fn().mockResolvedValue({}),
  setResponseStatus: vi.fn(),
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

vi.mock('./inspection-request-create.schema', () => ({
  inspectionRequestCreateV2BodySchema: { parse: vi.fn((body) => body) },
  validateInspectionRequestCreateV2Body: vi
    .fn()
    .mockReturnValue({ isValid: true }),
}));

vi.mock('./inspection-request-create.service', () => ({
  InspectionRequestCreateService: { createRequest: vi.fn() },
}));

describe('public inspection request create handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retires the public name-only legacy write path', async () => {
    await expect(handler({} as never)).resolves.toMatchObject({
      code: 'INSPECTION_REQUEST_V2_REQUIRED',
      statusCode: 410,
    });
    expect(InspectionRequestCreateService.createRequest).not.toHaveBeenCalled();
  });

  it('creates public requests through the ID-first V2 contract', async () => {
    vi.mocked(InspectionRequestCreateService.createRequest).mockResolvedValue({
      id: 'request-1',
    } as never);

    await publicInspectionRequestCreateV2Handler({} as never);

    expect(InspectionRequestCreateService.createRequest).toHaveBeenCalledWith(
      expect.anything(),
      null,
      {},
      true,
      'V2',
    );
    expect(useResponseSuccess).toHaveBeenCalledWith({ id: 'request-1' });
  });

  it('rejects incomplete public V2 payloads before creation', async () => {
    const { validateInspectionRequestCreateV2Body } = await import(
      './inspection-request-create.schema'
    );
    vi.mocked(validateInspectionRequestCreateV2Body).mockReturnValue({
      isValid: false,
    } as never);

    await publicInspectionRequestCreateV2Handler({} as never);

    expect(badRequestResponse).toHaveBeenCalledOnce();
    expect(InspectionRequestCreateService.createRequest).not.toHaveBeenCalled();
  });
});
