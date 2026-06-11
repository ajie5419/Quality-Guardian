import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import uploadHandler from '~/modules/file-storage/upload.service';
import { getOptionalCurrentUser } from '~/utils/current-user';

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    getMaxUploadBytes: vi.fn().mockReturnValue(10 * 1024 * 1024),
    uploadFileStream: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/audit-log', () => ({
  recordBusinessAuditLog: vi.fn(),
}));

vi.mock('~/utils/current-user', () => ({
  getOptionalCurrentUser: vi.fn(),
}));

vi.mock('~/utils/response', () => ({
  useResponseError: vi.fn().mockImplementation((_msg: string) => ({
    _error: true,
    message: _msg,
  })),
  useResponseSuccess: vi.fn().mockImplementation((data: unknown) => ({
    _success: true,
    data,
  })),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

vi.mock('@fastify/busboy', () => {
  let lastInstance: any;
  const Mock = vi.fn().mockImplementation(() => {
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    lastInstance = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        handlers[event] = handler;
        return lastInstance;
      }),
      _handlers: handlers,
      _emit(event: string, ...args: unknown[]) {
        handlers[event]?.(...args);
      },
    };
    return lastInstance;
  });
  return {
    default: Mock,
    __getLastInstance: () => lastInstance,
  };
});

describe('upload service handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when content-type is missing', async () => {
    const event = {
      node: { req: { headers: {} }, res: { setHeader: vi.fn() } },
    } as any;

    const result = await uploadHandler(event);

    expect(result).toEqual(expect.objectContaining({ _error: true }));
  });

  it('returns 400 when content-type is not multipart', async () => {
    const event = {
      node: {
        req: { headers: { 'content-type': 'application/json' } },
        res: { setHeader: vi.fn() },
      },
    } as any;

    const result = await uploadHandler(event);

    expect(result).toEqual(expect.objectContaining({ _error: true }));
  });

  it('calls uploadFileStream with correct parameters on file upload', async () => {
    (FileStorageService.uploadFileStream as any).mockResolvedValue({
      id: 'file-1',
      originalName: 'test.pdf',
      size: 1024,
      storedName: 'stored.pdf',
      thumbFilename: null,
      thumbUrl: null,
      mimeType: 'application/pdf',
      url: '/uploads/stored.pdf',
    });
    (getOptionalCurrentUser as any).mockReturnValue({ id: 1 });

    const event = {
      node: {
        req: {
          headers: { 'content-type': 'multipart/form-data; boundary=----test' },
          pipe: vi.fn(),
        },
        res: { setHeader: vi.fn() },
      },
    } as any;

    (event.node.req.pipe as any).mockImplementation((busboy: any) => {
      const mockFile = {
        on: vi.fn(),
        resume: vi.fn(),
        destroy: vi.fn(),
      };
      busboy._emit(
        'file',
        'file',
        mockFile,
        'test.pdf',
        null,
        'application/pdf',
      );
      busboy._emit('finish');
    });

    await uploadHandler(event);

    expect(FileStorageService.uploadFileStream).toHaveBeenCalled();
  });
});
