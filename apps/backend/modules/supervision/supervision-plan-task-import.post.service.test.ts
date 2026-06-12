import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getRouterParam: vi.fn(() => undefined),
  readBody: (event: { body?: unknown }) => Promise.resolve(event.body || {}),
}));

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    registerReferencesFromAttachments: vi.fn(),
  },
}));

vi.mock('~/modules/supervision/supervision.service', () => ({
  SupervisionService: {
    importPlanTasks: vi.fn().mockResolvedValue({ imported: 5 }),
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

describe('supervision-plan-task-import.post.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should import plan tasks and return success', async () => {
    const { getRouterParam } = await import('h3');
    const { SupervisionService } = await import(
      '~/modules/supervision/supervision.service'
    );
    const { useResponseSuccess } = await import('~/utils/response');

    vi.mocked(getRouterParam).mockReturnValue('proj-1');
    vi.mocked(SupervisionService.importPlanTasks).mockResolvedValue({
      imported: 5,
    } as any);

    const handlerModule = await import(
      '~/modules/supervision/supervision-plan-task-import.post.service'
    );
    const handler = handlerModule.default;
    const event = {
      body: {
        fileUrl: 'https://example.com/plan.xlsx',
      },
      context: {},
    } as any;

    const result = await handler(event);

    expect(SupervisionService.importPlanTasks).toHaveBeenCalledWith(
      'proj-1',
      expect.any(Object),
    );
    expect(useResponseSuccess).toHaveBeenCalled();
    expect(result).toEqual({ _success: true, data: { imported: 5 } });
  });

  it('should return bad request when projectId is missing', async () => {
    const { getRouterParam } = await import('h3');
    const { badRequestResponse } = await import('~/utils/response');

    vi.mocked(getRouterParam).mockReturnValue(undefined);

    const handlerModule = await import(
      '~/modules/supervision/supervision-plan-task-import.post.service'
    );
    const handler = handlerModule.default;
    const event = {
      body: {},
      context: {},
    } as any;

    await handler(event);

    expect(badRequestResponse).toHaveBeenCalledWith(event, '监造项目不能为空');
  });

  it('should return bad request when fileUrl is missing', async () => {
    const { getRouterParam } = await import('h3');
    const { badRequestResponse } = await import('~/utils/response');

    vi.mocked(getRouterParam).mockReturnValue('proj-1');

    const handlerModule = await import(
      '~/modules/supervision/supervision-plan-task-import.post.service'
    );
    const handler = handlerModule.default;
    const event = {
      body: {},
      context: {},
    } as any;

    await handler(event);

    expect(badRequestResponse).toHaveBeenCalledWith(event, '计划文件不能为空');
  });

  it('should return internal server error on unexpected error', async () => {
    const { getRouterParam } = await import('h3');
    const { SupervisionService } = await import(
      '~/modules/supervision/supervision.service'
    );
    const { internalServerErrorResponse } = await import('~/utils/response');
    const { logApiError } = await import('~/utils/api-logger');

    vi.mocked(getRouterParam).mockReturnValue('proj-1');
    vi.mocked(SupervisionService.importPlanTasks).mockRejectedValue(
      new Error('import failed'),
    );

    const handlerModule = await import(
      '~/modules/supervision/supervision-plan-task-import.post.service'
    );
    const handler = handlerModule.default;
    const event = {
      body: {
        fileUrl: 'https://example.com/plan.xlsx',
      },
      context: {},
    } as any;

    await handler(event);

    expect(logApiError).toHaveBeenCalled();
    expect(internalServerErrorResponse).toHaveBeenCalledWith(
      event,
      'import failed',
    );
  });

  it('should register file references after successful import', async () => {
    const { getRouterParam } = await import('h3');
    const { FileStorageService } = await import(
      '~/modules/file-storage/file-storage.service'
    );
    const { SupervisionService } = await import(
      '~/modules/supervision/supervision.service'
    );

    vi.mocked(getRouterParam).mockReturnValue('proj-1');
    vi.mocked(SupervisionService.importPlanTasks).mockResolvedValue({
      imported: 3,
    } as any);

    const handlerModule = await import(
      '~/modules/supervision/supervision-plan-task-import.post.service'
    );
    const handler = handlerModule.default;
    const event = {
      body: {
        fileUrl: 'https://example.com/plan.xlsx',
      },
      context: {},
    } as any;

    await handler(event);

    expect(
      FileStorageService.registerReferencesFromAttachments,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        bizId: 'proj-1',
        bizType: 'supervision_plan_task',
      }),
    );
  });
});
