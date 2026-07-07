import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '~/modules/inspection/inspection-request-close.post.service';
import { InspectionRouteService } from '~/modules/inspection/inspection-route.service';
import { BusinessError } from '~/utils/business-error';
import {
  badRequestResponse,
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: vi.fn().mockResolvedValue({}),
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn().mockReturnValue({ id: 'user-1' }),
}));

vi.mock('~/utils/route-param', () => ({
  getRequiredRouterParam: vi.fn().mockReturnValue('req-1'),
}));

vi.mock('~/utils/response', () => ({
  badRequestResponse: vi
    .fn()
    .mockImplementation((_event: any, msg: string) => ({
      statusCode: 400,
      message: msg,
    })),
  forbiddenResponse: vi.fn().mockImplementation((_event: any, msg: string) => ({
    statusCode: 403,
    message: msg,
  })),
  internalServerErrorResponse: vi
    .fn()
    .mockImplementation((_event: any, msg: string) => ({
      statusCode: 500,
      message: msg,
    })),
  notFoundResponse: vi.fn().mockImplementation((_event: any, msg: string) => ({
    statusCode: 404,
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

vi.mock('~/modules/inspection/inspection-route.service', () => ({
  InspectionRouteService: {
    closeRequest: vi.fn(),
  },
}));

describe('inspection-request-close.post.handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return success response on successful close', async () => {
    const mockResult = { id: 'req-1', status: 'CLOSED' };
    (InspectionRouteService.closeRequest as any).mockResolvedValue(mockResult);

    const _result = await handler({} as any);

    expect(InspectionRouteService.closeRequest).toHaveBeenCalled();
    expect(useResponseSuccess).toHaveBeenCalledWith(mockResult);
  });

  it('should return badRequestResponse for VALIDATION errors', async () => {
    (InspectionRouteService.closeRequest as any).mockRejectedValue(
      new BusinessError('VALIDATION', '检验结果必须为合格或不合格', 400),
    );

    const _result = await handler({} as any);

    expect(badRequestResponse).toHaveBeenCalledWith(
      expect.anything(),
      '检验结果必须为合格或不合格',
    );
  });

  it('should return notFoundResponse for NOT_FOUND errors', async () => {
    (InspectionRouteService.closeRequest as any).mockRejectedValue(
      new BusinessError('NOT_FOUND', '报检任务不存在', 404),
    );

    const _result = await handler({} as any);

    expect(notFoundResponse).toHaveBeenCalledWith(
      expect.anything(),
      '报检任务不存在',
    );
  });

  it('should return internalServerErrorResponse for unknown errors', async () => {
    (InspectionRouteService.closeRequest as any).mockRejectedValue(
      new Error('something broke'),
    );

    const _result = await handler({} as any);

    expect(internalServerErrorResponse).toHaveBeenCalledWith(
      expect.anything(),
      '关闭报检任务失败',
    );
  });
});
