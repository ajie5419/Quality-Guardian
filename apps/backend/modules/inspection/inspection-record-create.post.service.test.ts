import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '~/modules/inspection/inspection-record-create.post.service';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { SystemService } from '~/modules/system/system.service';
import {
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: vi.fn().mockResolvedValue({}),
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn().mockReturnValue({ id: 'user-1' }),
}));

vi.mock('~/modules/inspection/inspection.service', () => ({
  InspectionService: {
    create: vi.fn(),
  },
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

describe('inspection-record-create.post.handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (SystemService.isInspectionManualCreateEnabled as any).mockResolvedValue(
      true,
    );
  });

  it('creates the record and records an audit log when enabled', async () => {
    const mockResult = { id: 'rec-1', projectName: 'P1' };
    (InspectionService.create as any).mockResolvedValue(mockResult);

    await handler({} as any);

    expect(InspectionService.create).toHaveBeenCalled();
    expect(recordBusinessAuditLog).toHaveBeenCalled();
    expect(useResponseSuccess).toHaveBeenCalledWith(mockResult);
  });

  it('rejects with a business error when manual creation is disabled', async () => {
    (SystemService.isInspectionManualCreateEnabled as any).mockResolvedValue(
      false,
    );
    (legacyErrorToBusinessError as any).mockImplementation(
      (error: any) => error,
    );

    await handler({} as any);

    expect(InspectionService.create).not.toHaveBeenCalled();
    expect(businessErrorResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ code: 'INSPECTION_MANUAL_CREATE_DISABLED' }),
    );
  });

  it('returns internalServerErrorResponse for unknown errors', async () => {
    (InspectionService.create as any).mockRejectedValue(
      new Error('something broke'),
    );
    (legacyErrorToBusinessError as any).mockReturnValue(null);

    await handler({} as any);

    expect(internalServerErrorResponse).toHaveBeenCalledWith(
      expect.anything(),
      'Failed to create inspection record',
    );
  });
});
