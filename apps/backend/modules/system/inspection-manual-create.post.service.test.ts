import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RbacService } from '~/modules/rbac/rbac.service';
import handler from '~/modules/system/inspection-manual-create.post.service';
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
  readBody: vi.fn().mockResolvedValue({ enabled: false }),
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn().mockReturnValue({ id: 'user-1' }),
}));

vi.mock('~/modules/rbac/rbac.service', () => ({
  RbacService: {
    getUserPermissionCodes: vi.fn(),
  },
}));

vi.mock('~/modules/system/system.service', () => ({
  SystemService: {
    saveSettingValue: vi.fn(),
  },
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

describe('inspection-manual-create.post.handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves the setting when the user has permission', async () => {
    (RbacService.getUserPermissionCodes as any).mockResolvedValue([
      'System:InspectionSettings:Edit',
    ]);

    await handler({} as any);

    expect(SystemService.saveSettingValue).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'INSPECTION_MANUAL_CREATE_ENABLED',
        value: 'false',
      }),
    );
    expect(useResponseSuccess).toHaveBeenCalled();
  });

  it('rejects with a business error when the user lacks permission', async () => {
    (RbacService.getUserPermissionCodes as any).mockResolvedValue([]);
    (legacyErrorToBusinessError as any).mockImplementation(
      (error: any) => error,
    );

    await handler({} as any);

    expect(SystemService.saveSettingValue).not.toHaveBeenCalled();
    expect(businessErrorResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ code: 'PERMISSION_DENIED' }),
    );
  });

  it('returns internalServerErrorResponse for unknown errors', async () => {
    (RbacService.getUserPermissionCodes as any).mockResolvedValue([
      'System:InspectionSettings:Edit',
    ]);
    (SystemService.saveSettingValue as any).mockRejectedValue(
      new Error('db down'),
    );
    (legacyErrorToBusinessError as any).mockReturnValue(null);

    await handler({} as any);

    expect(internalServerErrorResponse).toHaveBeenCalledWith(
      expect.anything(),
      'Failed to save inspection manual create setting',
    );
  });
});
