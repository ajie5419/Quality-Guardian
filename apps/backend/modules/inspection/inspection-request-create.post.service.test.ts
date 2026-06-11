import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '~/modules/inspection/inspection-request-create.post.service';
import { InspectionRequestCreateService } from '~/modules/inspection/inspection-request-create.service';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: vi.fn(),
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn().mockReturnValue({ id: 'user-1' }),
}));

vi.mock('~/utils/response', () => ({
  badRequestResponse: vi
    .fn()
    .mockImplementation((_event: any, msg: string) => ({
      statusCode: 400,
      message: msg,
    })),
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

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

vi.mock('~/modules/inspection/inspection-request-create.schema', () => ({
  inspectionRequestCreateBodySchema: {
    parse: vi.fn().mockImplementation((body: any) => body),
  },
  validateInspectionRequestCreateBody: vi.fn().mockReturnValue({
    isValid: true,
  }),
}));

vi.mock('~/modules/inspection/inspection-request-create.service', () => ({
  InspectionRequestCreateService: {
    createRequest: vi.fn(),
  },
}));

describe('inspection-request-create.post.handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return success response on successful create', async () => {
    const mockResult = { id: 'req-1', requestNo: 'REQ-001' };
    (InspectionRequestCreateService.createRequest as any).mockResolvedValue(
      mockResult,
    );

    const _result = await handler({} as any);

    expect(InspectionRequestCreateService.createRequest).toHaveBeenCalled();
    expect(useResponseSuccess).toHaveBeenCalledWith(mockResult);
  });

  it('should return badRequestResponse when validation fails', async () => {
    const { validateInspectionRequestCreateBody } = await import(
      '~/modules/inspection/inspection-request-create.schema'
    );
    (validateInspectionRequestCreateBody as any).mockReturnValue({
      isValid: false,
    });

    const _result = await handler({} as any);

    expect(badRequestResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('不能为空'),
    );
  });

  it('should return badRequestResponse for BAD_REQUEST errors', async () => {
    const { validateInspectionRequestCreateBody } = await import(
      '~/modules/inspection/inspection-request-create.schema'
    );
    (validateInspectionRequestCreateBody as any).mockReturnValue({
      isValid: true,
    });
    (InspectionRequestCreateService.createRequest as any).mockRejectedValue(
      new Error('BAD_REQUEST:工单号不存在'),
    );

    const _result = await handler({} as any);

    expect(badRequestResponse).toHaveBeenCalledWith(
      expect.anything(),
      '工单号不存在',
    );
  });

  it('should return internalServerErrorResponse for unknown errors', async () => {
    const { validateInspectionRequestCreateBody } = await import(
      '~/modules/inspection/inspection-request-create.schema'
    );
    (validateInspectionRequestCreateBody as any).mockReturnValue({
      isValid: true,
    });
    (InspectionRequestCreateService.createRequest as any).mockRejectedValue(
      new Error('something broke'),
    );

    const _result = await handler({} as any);

    expect(internalServerErrorResponse).toHaveBeenCalledWith(
      expect.anything(),
      '创建报检任务失败',
    );
  });
});
