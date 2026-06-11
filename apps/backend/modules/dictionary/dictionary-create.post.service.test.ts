import { readBody } from 'h3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '~/modules/dictionary/dictionary-create.post.service';
import { DictionaryService } from '~/modules/dictionary/dictionary.service';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import {
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import { isPrismaUniqueConflictError } from '~/utils/prisma-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: vi.fn(),
}));

vi.mock('~/modules/dictionary/dictionary.service', () => ({
  DictionaryService: {
    create: vi.fn(),
  },
}));

vi.mock('~/modules/user/system-auth', () => ({
  requireSystemAdmin: vi.fn(),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

vi.mock('~/utils/business-error', () => ({
  businessErrorResponse: vi.fn(),
  legacyErrorToBusinessError: vi.fn(),
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaUniqueConflictError: vi.fn(),
}));

vi.mock('~/utils/response', () => ({
  conflictResponse: vi.fn(),
  internalServerErrorResponse: vi.fn(),
  useResponseSuccess: vi.fn(),
}));

function mockEvent() {
  return { context: { user: { id: 'user-1', username: 'admin' } } } as any;
}

describe('dictionaryCreatePostService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCurrentUser as any).mockReturnValue({
      id: 'user-1',
      username: 'admin',
    });
    (requireSystemAdmin as any).mockReturnValue(null);
  });

  it('should create dictionary item successfully', async () => {
    (readBody as any).mockResolvedValue({
      dictType: 'inspection_issue_status',
      dictKey: 'OPEN',
      dictValue: 'Open',
    });
    (DictionaryService.create as any).mockResolvedValue({ id: 'new-id' });
    (useResponseSuccess as any).mockReturnValue({ code: 0 });

    const event = mockEvent();
    const _result = await handler(event);

    expect(DictionaryService.create).toHaveBeenCalledWith(
      {
        dictType: 'inspection_issue_status',
        dictKey: 'OPEN',
        dictValue: 'Open',
      },
      'admin',
    );
    expect(useResponseSuccess).toHaveBeenCalledWith({ id: 'new-id' });
  });

  it('should return conflictResponse on unique conflict', async () => {
    (readBody as any).mockResolvedValue({
      dictType: 'inspection_issue_status',
      dictKey: 'OPEN',
      dictValue: 'Open',
    });
    (DictionaryService.create as any).mockRejectedValue(
      new Error('unique conflict'),
    );
    (isPrismaUniqueConflictError as any).mockReturnValue(true);
    (conflictResponse as any).mockReturnValue({ code: 1 });

    const event = mockEvent();
    await handler(event);

    expect(conflictResponse).toHaveBeenCalledWith(event, '字典键已存在');
  });

  it('should return businessErrorResponse on business error', async () => {
    (readBody as any).mockResolvedValue({
      dictType: 'inspection_issue_status',
      dictKey: 'OPEN',
      dictValue: 'Open',
    });
    (DictionaryService.create as any).mockRejectedValue(
      new Error('business error'),
    );
    (legacyErrorToBusinessError as any).mockReturnValue({
      code: 'VALIDATION',
      message: 'error',
    });
    (businessErrorResponse as any).mockReturnValue({ code: 1 });

    const _result = await handler(mockEvent());

    expect(businessErrorResponse).toHaveBeenCalled();
  });

  it('should return internalServerErrorResponse on unknown error', async () => {
    (readBody as any).mockResolvedValue({
      dictType: 'inspection_issue_status',
      dictKey: 'OPEN',
      dictValue: 'Open',
    });
    (DictionaryService.create as any).mockRejectedValue(
      new Error('unknown error'),
    );
    (legacyErrorToBusinessError as any).mockReturnValue(null);
    (isPrismaUniqueConflictError as any).mockReturnValue(false);
    (internalServerErrorResponse as any).mockReturnValue({ code: 1 });

    const event = mockEvent();
    await handler(event);

    expect(internalServerErrorResponse).toHaveBeenCalledWith(
      event,
      '创建字典项失败',
    );
  });

  it('should return admin check result when user is not admin', async () => {
    (requireSystemAdmin as any).mockReturnValue({ code: 403 });

    const result = await handler(mockEvent());

    expect(result).toEqual({ code: 403 });
    expect(DictionaryService.create).not.toHaveBeenCalled();
  });

  it('should pass username to create call', async () => {
    (readBody as any).mockResolvedValue({
      dictType: 'inspection_issue_status',
      dictKey: 'NEW',
      dictValue: 'New',
    });
    (DictionaryService.create as any).mockResolvedValue({ id: 'new-id' });
    (useResponseSuccess as any).mockReturnValue({ code: 0 });

    await handler(mockEvent());

    expect(DictionaryService.create).toHaveBeenCalledWith(
      expect.anything(),
      'admin',
    );
  });
});
