import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '~/modules/inspection/inspection-record-id.put.service';
import { InspectionService } from '~/modules/inspection/inspection.service';

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: vi.fn().mockResolvedValue({}),
}));

vi.mock('~/modules/inspection/inspection.service', () => ({
  InspectionService: {
    update: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/audit-log', () => ({
  recordBusinessAuditLog: vi.fn(),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

vi.mock('~/utils/business-error', () => ({
  businessErrorResponse: vi
    .fn()
    .mockImplementation((_event: any, err: any) => ({
      statusCode: err.statusCode || 400,
      message: err.message,
    })),
  legacyErrorToBusinessError: vi.fn().mockReturnValue(null),
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn().mockReturnValue({ id: 'user-1' }),
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaNotFoundError: vi.fn().mockReturnValue(false),
}));

vi.mock('~/utils/response', () => ({
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

vi.mock('~/utils/route-param', () => ({
  getRequiredRouterParam: vi.fn().mockReturnValue('insp-1'),
}));

describe('inspection-record-id.put.handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return success response on successful update', async () => {
    const mockResult = {
      id: 'insp-1',
      projectName: 'Project A',
      workOrderNumber: 'WO-1',
    };
    (InspectionService.update as any).mockResolvedValue(mockResult);

    const result = await handler({} as any);

    expect(InspectionService.update).toHaveBeenCalledWith('insp-1', {});
    expect(result).toEqual(
      expect.objectContaining({ statusCode: 200, data: mockResult }),
    );
  });

  it('should return notFoundResponse when prisma not found error', async () => {
    const { isPrismaNotFoundError } = await import('~/utils/prisma-error');
    (isPrismaNotFoundError as any).mockReturnValue(true);
    (InspectionService.update as any).mockRejectedValue(new Error('not found'));

    const result = await handler({} as any);

    expect(result).toEqual(expect.objectContaining({ statusCode: 404 }));
  });

  it('should return internalServerErrorResponse for unknown errors', async () => {
    const { isPrismaNotFoundError } = await import('~/utils/prisma-error');
    (isPrismaNotFoundError as any).mockReturnValue(false);
    (InspectionService.update as any).mockRejectedValue(
      new Error('something broke'),
    );

    const result = await handler({} as any);

    expect(result).toEqual(expect.objectContaining({ statusCode: 500 }));
  });
});
