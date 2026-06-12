import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  readBody: (event: { body?: unknown }) => Promise.resolve(event.body || {}),
}));

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    registerReferencesFromAttachments: vi.fn(),
  },
}));

vi.mock('~/modules/supervision/supervision.service', () => ({
  SupervisionService: {
    createIssue: vi.fn().mockResolvedValue({ id: 'issue-1' }),
  },
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn().mockReturnValue({ id: 'u1', username: 'admin' }),
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaSchemaMismatchError: vi.fn().mockReturnValue(false),
}));

vi.mock('~/utils/response', () => ({
  badRequestResponse: vi.fn().mockReturnValue({ _success: false }),
  internalServerErrorResponse: vi.fn().mockReturnValue({ _success: false }),
  useResponseSuccess: vi.fn().mockImplementation((data: any) => ({
    _success: true,
    data,
  })),
}));

describe('supervision-issue-create.post.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create an issue and return success', async () => {
    const { SupervisionService } = await import(
      '~/modules/supervision/supervision.service'
    );
    const { useResponseSuccess } = await import('~/utils/response');

    vi.mocked(SupervisionService.createIssue).mockResolvedValue({
      id: 'issue-1',
    } as any);

    const handlerModule = await import(
      '~/modules/supervision/supervision-issue-create.post.service'
    );
    const handler = handlerModule.default;
    const event = {
      body: {
        description: 'Test issue',
        projectId: 'proj-1',
      },
      context: {},
    } as any;

    const result = await handler(event);

    expect(SupervisionService.createIssue).toHaveBeenCalled();
    expect(useResponseSuccess).toHaveBeenCalled();
    expect(result).toEqual({ _success: true, data: { id: 'issue-1' } });
  });

  it('should return bad request when projectId is missing', async () => {
    const { badRequestResponse } = await import('~/utils/response');

    const handlerModule = await import(
      '~/modules/supervision/supervision-issue-create.post.service'
    );
    const handler = handlerModule.default;
    const event = {
      body: {
        description: 'Test issue',
      },
      context: {},
    } as any;

    await handler(event);

    expect(badRequestResponse).toHaveBeenCalledWith(event, '监造项目不能为空');
  });

  it('should return bad request when description is missing', async () => {
    const { badRequestResponse } = await import('~/utils/response');

    const handlerModule = await import(
      '~/modules/supervision/supervision-issue-create.post.service'
    );
    const handler = handlerModule.default;
    const event = {
      body: {
        projectId: 'proj-1',
      },
      context: {},
    } as any;

    await handler(event);

    expect(badRequestResponse).toHaveBeenCalledWith(event, '问题描述不能为空');
  });

  it('should return internal server error on unexpected error', async () => {
    const { SupervisionService } = await import(
      '~/modules/supervision/supervision.service'
    );
    const { internalServerErrorResponse } = await import('~/utils/response');
    const { logApiError } = await import('~/utils/api-logger');

    vi.mocked(SupervisionService.createIssue).mockRejectedValue(
      new Error('db error'),
    );

    const handlerModule = await import(
      '~/modules/supervision/supervision-issue-create.post.service'
    );
    const handler = handlerModule.default;
    const event = {
      body: {
        description: 'Test',
        projectId: 'proj-1',
      },
      context: {},
    } as any;

    await handler(event);

    expect(logApiError).toHaveBeenCalled();
    expect(internalServerErrorResponse).toHaveBeenCalled();
  });

  it('should register file references after successful creation', async () => {
    const { FileStorageService } = await import(
      '~/modules/file-storage/file-storage.service'
    );
    const { SupervisionService } = await import(
      '~/modules/supervision/supervision.service'
    );

    vi.mocked(SupervisionService.createIssue).mockResolvedValue({
      id: 'issue-new',
    } as any);

    const handlerModule = await import(
      '~/modules/supervision/supervision-issue-create.post.service'
    );
    const handler = handlerModule.default;
    const event = {
      body: {
        description: 'Test',
        photos: ['file1.pdf'],
        projectId: 'proj-1',
      },
      context: {},
    } as any;

    await handler(event);

    expect(
      FileStorageService.registerReferencesFromAttachments,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        bizId: 'issue-new',
        bizType: 'supervision_issue',
      }),
    );
  });
});
