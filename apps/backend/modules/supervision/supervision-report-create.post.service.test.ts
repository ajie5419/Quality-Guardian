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
    createReport: vi.fn().mockResolvedValue({ id: 'report-1' }),
  },
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
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

describe('supervision-report-create.post.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a report and return success', async () => {
    const { SupervisionService } = await import(
      '~/modules/supervision/supervision.service'
    );
    const { useResponseSuccess } = await import('~/utils/response');

    vi.mocked(SupervisionService.createReport).mockResolvedValue({
      id: 'report-1',
    } as any);

    const handlerModule = await import(
      '~/modules/supervision/supervision-report-create.post.service'
    );
    const handler = handlerModule.default;
    const event = {
      body: {
        projectId: 'proj-1',
        reporter: 'admin',
      },
      context: {},
    } as any;

    const result = await handler(event);

    expect(SupervisionService.createReport).toHaveBeenCalled();
    expect(useResponseSuccess).toHaveBeenCalled();
    expect(result).toEqual({ _success: true, data: { id: 'report-1' } });
  });

  it('should return bad request when projectId is missing', async () => {
    const { badRequestResponse } = await import('~/utils/response');

    const handlerModule = await import(
      '~/modules/supervision/supervision-report-create.post.service'
    );
    const handler = handlerModule.default;
    const event = {
      body: {
        reporter: 'admin',
      },
      context: {},
    } as any;

    await handler(event);

    expect(badRequestResponse).toHaveBeenCalledWith(event, '监造项目不能为空');
  });

  it('should return bad request when reporter is missing', async () => {
    const { badRequestResponse } = await import('~/utils/response');

    const handlerModule = await import(
      '~/modules/supervision/supervision-report-create.post.service'
    );
    const handler = handlerModule.default;
    const event = {
      body: {
        projectId: 'proj-1',
      },
      context: {},
    } as any;

    await handler(event);

    expect(badRequestResponse).toHaveBeenCalledWith(event, '监造人员不能为空');
  });

  it('should return internal server error on unexpected error', async () => {
    const { SupervisionService } = await import(
      '~/modules/supervision/supervision.service'
    );
    const { internalServerErrorResponse } = await import('~/utils/response');
    const { logApiError } = await import('~/utils/api-logger');

    vi.mocked(SupervisionService.createReport).mockRejectedValue(
      new Error('db error'),
    );

    const handlerModule = await import(
      '~/modules/supervision/supervision-report-create.post.service'
    );
    const handler = handlerModule.default;
    const event = {
      body: {
        projectId: 'proj-1',
        reporter: 'admin',
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

    vi.mocked(SupervisionService.createReport).mockResolvedValue({
      id: 'report-new',
    } as any);

    const handlerModule = await import(
      '~/modules/supervision/supervision-report-create.post.service'
    );
    const handler = handlerModule.default;
    const event = {
      body: {
        attachments: ['file1.pdf'],
        projectId: 'proj-1',
        reporter: 'admin',
      },
      context: {},
    } as any;

    await handler(event);

    expect(
      FileStorageService.registerReferencesFromAttachments,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        bizId: 'report-new',
        bizType: 'supervision_daily_report',
      }),
    );
  });
});
