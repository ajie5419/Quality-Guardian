import { Buffer } from 'node:buffer';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import handler from '~/modules/file-storage/upload-filename.get.service';
import { getRequiredRouterParam } from '~/utils/route-param';

const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}));

vi.mock('node:fs', () => {
  const mod = {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  };
  return { ...mod, default: mod };
});

vi.mock('node:fs/promises', () => {
  const mod = { writeFile: vi.fn() };
  return { ...mod, default: mod };
});

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>();
  return {
    ...actual,
    setResponseStatus: vi.fn(),
  };
});

vi.mock('sharp', () => ({
  default: vi.fn().mockImplementation(() => ({
    resize: vi.fn().mockReturnThis(),
    rotate: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('thumb')),
    webp: vi.fn().mockReturnThis(),
  })),
}));

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    getFileBufferByStoredName: vi.fn(),
  },
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

vi.mock('~/utils/paths', () => ({
  UPLOAD_DIR: '/tmp/uploads',
}));

vi.mock('~/utils/response', () => ({
  useResponseError: vi.fn().mockImplementation((msg: string) => ({
    _error: true,
    message: msg,
  })),
}));

vi.mock('~/utils/route-param', () => ({
  getRequiredRouterParam: vi
    .fn()
    .mockImplementation((_event: any, name: string) => {
      return name === 'filename' ? 'test-file.pdf' : null;
    }),
}));

describe('uploadFilenameGetService handler', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReset();
    mockReadFileSync.mockReturnValue(Buffer.from('file-content'));
    vi.mocked(getRequiredRouterParam).mockReset();
    vi.mocked(getRequiredRouterParam).mockImplementation(
      (_event: any, name: string) => {
        return name === 'filename' ? 'test-file.pdf' : null;
      },
    );
  });

  it('returns 403 for path traversal attempts', async () => {
    vi.mocked(getRequiredRouterParam).mockReturnValue(
      '../../../etc/passwd' as any,
    );

    const event = {
      node: { req: { headers: {} }, res: { setHeader: vi.fn() } },
    } as any;

    const result = await handler(event);

    expect(result).toEqual(expect.objectContaining({ _error: true }));
  });

  it('returns 404 when file does not exist locally or in storage', async () => {
    const event = {
      node: { req: { headers: {} }, res: { setHeader: vi.fn() } },
    } as any;

    const result = await handler(event);

    expect(result).toEqual(expect.objectContaining({ _error: true }));
  });

  it('returns file buffer when file exists locally', async () => {
    mockExistsSync.mockReturnValue(true);

    const event = {
      node: { req: { headers: {} }, res: { setHeader: vi.fn() } },
    } as any;

    const result = await handler(event);

    expect(result).toBeInstanceOf(Buffer);
    expect(event.node.res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=31536000, immutable',
    );
  });

  it('fetches from storage when file not found locally', async () => {
    mockExistsSync.mockReturnValue(false);
    vi.mocked(
      FileStorageService.getFileBufferByStoredName as any,
    ).mockResolvedValue({
      buffer: Buffer.from('remote'),
      mimeType: 'image/png',
    });

    const event = {
      node: { req: { headers: {} }, res: { setHeader: vi.fn() } },
    } as any;

    const result = await handler(event);

    expect(result).toBeInstanceOf(Buffer);
    expect(event.node.res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'image/png',
    );
  });

  it('uses correct MIME type for .jpg extension', async () => {
    vi.mocked(getRequiredRouterParam).mockReturnValue('photo.jpg' as any);
    mockExistsSync.mockReturnValue(true);

    const event = {
      node: { req: { headers: {} }, res: { setHeader: vi.fn() } },
    } as any;

    await handler(event);

    expect(event.node.res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'image/jpeg',
    );
  });

  it('uses correct MIME type for .png extension', async () => {
    vi.mocked(getRequiredRouterParam).mockReturnValue('image.png' as any);
    mockExistsSync.mockReturnValue(true);

    const event = {
      node: { req: { headers: {} }, res: { setHeader: vi.fn() } },
    } as any;

    await handler(event);

    expect(event.node.res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'image/png',
    );
  });

  it('uses octet-stream for unknown extensions', async () => {
    vi.mocked(getRequiredRouterParam).mockReturnValue('data.xyz' as any);
    mockExistsSync.mockReturnValue(true);

    const event = {
      node: { req: { headers: {} }, res: { setHeader: vi.fn() } },
    } as any;

    await handler(event);

    expect(event.node.res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/octet-stream',
    );
  });
});
