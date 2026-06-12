import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('h3', () => ({
  defineEventHandler: vi.fn((fn: any) => fn),
  readBody: vi.fn(),
}));

vi.mock('~/modules/inspection/inspection-request-create.schema', () => ({
  inspectionRequestCreateBodySchema: {
    parse: vi.fn((v: any) => v),
  },
  validateInspectionRequestCreateBody: vi.fn(),
}));

vi.mock('~/modules/inspection/inspection-request-create.service', () => ({
  InspectionRequestCreateService: {
    createRequest: vi.fn().mockResolvedValue({ id: 'req-1' }),
  },
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

vi.mock('~/utils/response', () => ({
  badRequestResponse: vi.fn().mockReturnValue({ _success: false }),
  internalServerErrorResponse: vi.fn().mockReturnValue({ _success: false }),
  useResponseSuccess: vi.fn().mockImplementation((data: any) => ({
    _success: true,
    data,
  })),
}));

describe('public-inspection-request-create.post.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return success when request is valid', async () => {
    const { validateInspectionRequestCreateBody } = await import(
      '~/modules/inspection/inspection-request-create.schema'
    );
    const { InspectionRequestCreateService } = await import(
      '~/modules/inspection/inspection-request-create.service'
    );
    const { useResponseSuccess } = await import('~/utils/response');

    vi.mocked(validateInspectionRequestCreateBody).mockReturnValue({
      isValid: true,
    } as any);
    vi.mocked(InspectionRequestCreateService.createRequest).mockResolvedValue({
      id: 'req-1',
    } as any);

    const handlerModule = await import(
      '~/modules/inspection/public-inspection-request-create.post.service'
    );
    const handler = handlerModule.default;
    const event = {} as any;

    const result = await handler(event);

    expect(useResponseSuccess).toHaveBeenCalledWith({ id: 'req-1' });
    expect(result).toEqual({ _success: true, data: { id: 'req-1' } });
  });

  it('should return bad request when validation fails', async () => {
    const { validateInspectionRequestCreateBody } = await import(
      '~/modules/inspection/inspection-request-create.schema'
    );
    const { badRequestResponse } = await import('~/utils/response');

    vi.mocked(validateInspectionRequestCreateBody).mockReturnValue({
      isValid: false,
    } as any);

    const handlerModule = await import(
      '~/modules/inspection/public-inspection-request-create.post.service'
    );
    const handler = handlerModule.default;
    const event = {} as any;

    await handler(event);

    expect(badRequestResponse).toHaveBeenCalledWith(
      event,
      '工单号、工序、一级部件名称、组件名称、班组、报检人、自检记录不能为空',
    );
  });

  it('should return bad request when service throws BAD_REQUEST', async () => {
    const { validateInspectionRequestCreateBody } = await import(
      '~/modules/inspection/inspection-request-create.schema'
    );
    const { InspectionRequestCreateService } = await import(
      '~/modules/inspection/inspection-request-create.service'
    );
    const { badRequestResponse } = await import('~/utils/response');

    vi.mocked(validateInspectionRequestCreateBody).mockReturnValue({
      isValid: true,
    } as any);
    vi.mocked(InspectionRequestCreateService.createRequest).mockRejectedValue(
      new Error('BAD_REQUEST:missing field'),
    );

    const handlerModule = await import(
      '~/modules/inspection/public-inspection-request-create.post.service'
    );
    const handler = handlerModule.default;
    const event = {} as any;

    await handler(event);

    expect(badRequestResponse).toHaveBeenCalledWith(event, 'missing field');
  });

  it('should return internal server error on unexpected error', async () => {
    const { validateInspectionRequestCreateBody } = await import(
      '~/modules/inspection/inspection-request-create.schema'
    );
    const { InspectionRequestCreateService } = await import(
      '~/modules/inspection/inspection-request-create.service'
    );
    const { internalServerErrorResponse } = await import('~/utils/response');
    const { logApiError } = await import('~/utils/api-logger');

    vi.mocked(validateInspectionRequestCreateBody).mockReturnValue({
      isValid: true,
    } as any);
    vi.mocked(InspectionRequestCreateService.createRequest).mockRejectedValue(
      new Error('db error'),
    );

    const handlerModule = await import(
      '~/modules/inspection/public-inspection-request-create.post.service'
    );
    const handler = handlerModule.default;
    const event = {} as any;

    await handler(event);

    expect(logApiError).toHaveBeenCalled();
    expect(internalServerErrorResponse).toHaveBeenCalledWith(
      event,
      '创建报检任务失败',
    );
  });
});
