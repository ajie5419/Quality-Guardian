import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import prisma from '~/utils/prisma';

const uploadStream = vi.fn();
const download = vi.fn();
const exists = vi.fn();

vi.mock('~/utils/prisma', () => ({
  default: {
    file_assets: {
      aggregate: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    file_references: {
      create: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('~/modules/file-storage/storage-strategy', async () => {
  const actual = await vi.importActual<
    typeof import('~/modules/file-storage/storage-strategy')
  >('~/modules/file-storage/storage-strategy');
  return {
    ...actual,
    getStorageStrategy: () => ({
      getThumbUrl: vi.fn((_storedName, thumbObjectKey) =>
        thumbObjectKey ? `/thumbs/${thumbObjectKey}` : '',
      ),
      uploadStream,
    }),
    getStorageStrategyForProvider: () => ({
      download,
      exists,
    }),
  };
});

describe('fileStorageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('detects image filenames by extension', () => {
    expect(FileStorageService.isImageFilename('photo.JPG')).toBe(true);
    expect(FileStorageService.isImageFilename('report.pdf')).toBe(false);
  });

  it('soft deletes a file and removes references', async () => {
    vi.mocked(prisma.file_assets.update).mockResolvedValue({
      id: 'file-1',
      status: 'DELETED',
    } as never);

    const result = await FileStorageService.deleteFile('file-1', 9);

    expect(result).toEqual({
      deletedBy: '9',
      file: { id: 'file-1', status: 'DELETED' },
    });
    expect(prisma.file_assets.update).toHaveBeenCalledWith({
      where: { id: 'file-1' },
      data: {
        deletedAt: expect.any(Date),
        status: 'DELETED',
      },
    });
    expect(prisma.file_references.deleteMany).toHaveBeenCalledWith({
      where: { fileId: 'file-1' },
    });
  });

  it('returns null when requested file buffer is not active', async () => {
    vi.mocked(prisma.file_assets.findUnique).mockResolvedValue({
      id: 'file-1',
      status: 'DELETED',
    } as never);

    await expect(
      FileStorageService.getFileBuffer('file-1'),
    ).resolves.toBeNull();
    expect(download).not.toHaveBeenCalled();
  });

  it('loads file detail with ordered references', async () => {
    vi.mocked(prisma.file_assets.findUnique).mockResolvedValue({
      id: 'file-1',
    } as never);

    await FileStorageService.getFileDetail('file-1');

    expect(prisma.file_assets.findUnique).toHaveBeenCalledWith({
      include: {
        references: {
          orderBy: [
            { bizType: 'asc' },
            { fieldName: 'asc' },
            { sortOrder: 'asc' },
          ],
        },
      },
      where: { id: 'file-1' },
    });
  });

  it('delegates list and stats queries to file asset query helpers', async () => {
    vi.mocked(prisma.file_assets.findMany).mockResolvedValue([
      { id: 'file-1' },
    ] as never);
    vi.mocked(prisma.file_assets.count).mockResolvedValue(1 as never);
    vi.mocked(prisma.file_assets.aggregate)
      .mockResolvedValueOnce({
        _count: { id: 2 },
        _sum: { size: 30 },
      } as never)
      .mockResolvedValueOnce({
        _count: { id: 1 },
        _sum: { size: 10 },
      } as never);
    const groupByMock = prisma.file_assets.groupBy as any;
    groupByMock
      .mockResolvedValueOnce([
        { _count: { id: 1 }, _sum: { size: 10 }, status: 'ACTIVE' },
      ])
      .mockResolvedValueOnce([
        {
          _count: { id: 1 },
          _sum: { size: 10 },
          storageProvider: 'LOCAL',
        },
      ]);

    const page = await FileStorageService.listFiles({
      keyword: 'doc',
      page: 2,
      pageSize: 300,
      status: 'active',
    });
    const stats = await FileStorageService.getStorageStats();

    expect(page).toEqual({ items: [{ id: 'file-1' }], total: 1 });
    expect(prisma.file_assets.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 200,
        take: 200,
        where: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
    expect(stats).toEqual(
      expect.objectContaining({
        activeCount: 1,
        activeSize: 10,
        totalCount: 2,
        totalSize: 30,
      }),
    );
  });

  it('creates a single file reference with default field name and order', async () => {
    vi.mocked(prisma.file_references.create).mockResolvedValue({
      id: 'ref-1',
    } as never);

    await FileStorageService.registerReference({
      bizId: 'biz-1',
      bizType: 'inspection',
      fileId: 'file-1',
    });

    expect(prisma.file_references.create).toHaveBeenCalledWith({
      data: {
        bizId: 'biz-1',
        bizType: 'inspection',
        fieldName: 'attachments',
        fileId: 'file-1',
        sortOrder: 0,
      },
    });
  });

  it('registers references from mixed file ids and stored names in attachment order', async () => {
    vi.mocked(prisma.file_assets.findMany)
      .mockResolvedValueOnce([{ id: 'file-id-1' }] as never)
      .mockResolvedValueOnce([
        {
          id: 'file-id-2',
          objectKey: 'uploads/stored-2.png',
          storedName: 'stored-2.png',
          thumbObjectKey: 'uploads/stored-2_thumb.webp',
        },
      ] as never);
    vi.mocked(prisma.file_references.createMany).mockResolvedValue({
      count: 2,
    } as never);

    const result = await FileStorageService.registerReferencesFromAttachments({
      attachments: [
        { fileId: 'file-id-1' },
        '/uploads/stored-2.png?x=1',
        { fileId: 'missing' },
        '',
      ],
      bizId: 'biz-1',
      bizType: 'quality_record',
    });

    expect(result).toEqual({ count: 2 });
    expect(prisma.file_references.deleteMany).toHaveBeenCalledWith({
      where: {
        bizId: 'biz-1',
        bizType: 'quality_record',
        fieldName: 'attachments',
      },
    });
    expect(prisma.file_references.createMany).toHaveBeenCalledWith({
      data: [
        {
          bizId: 'biz-1',
          bizType: 'quality_record',
          fieldName: 'attachments',
          fileId: 'file-id-1',
          sortOrder: 0,
        },
        {
          bizId: 'biz-1',
          bizType: 'quality_record',
          fieldName: 'attachments',
          fileId: 'file-id-2',
          sortOrder: 1,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('downloads thumbnail buffer when stored name points to thumb object', async () => {
    const buffer = Buffer.from('thumb');
    const file = {
      id: 'file-1',
      mimeType: 'image/png',
      objectKey: 'uploads/image.png',
      originalName: 'image.png',
      status: 'ACTIVE',
      storageProvider: 'LOCAL',
      thumbObjectKey: 'uploads/image_thumb.webp',
    };
    vi.mocked(prisma.file_assets.findFirst).mockResolvedValue(file as never);
    vi.mocked(prisma.file_assets.findUnique).mockResolvedValue(file as never);
    download.mockResolvedValue(buffer);

    const result = await FileStorageService.getFileBufferByStoredName(
      'oss_image_thumb.webp',
    );

    expect(result).toEqual(
      expect.objectContaining({
        buffer,
        filename: 'file-1_thumb.webp',
        mimeType: 'image/webp',
      }),
    );
    expect(download).toHaveBeenCalledWith('uploads/image_thumb.webp');
  });

  it('uploads stream through storage strategy and persists normalized asset payload', async () => {
    uploadStream.mockResolvedValue({
      objectKey: 'uploads/doc.pdf',
      sha256: 'hash',
      size: 3,
      storageProvider: 'LOCAL',
      storedName: 'doc.pdf',
      url: '/uploads/doc.pdf',
    });
    vi.mocked(prisma.file_assets.create).mockResolvedValue({
      id: 'file-1',
      legacyUrl: '/uploads/doc.pdf',
      url: '/uploads/doc.pdf',
    } as never);

    const result = await FileStorageService.uploadFileStream({
      filename: 'doc.pdf',
      mimeType: null,
      stream: Readable.from(Buffer.from('abc')),
      uploadedBy: 7,
    });

    expect(uploadStream).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: 'application/pdf',
        stream: expect.any(Readable),
      }),
    );
    expect(prisma.file_assets.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mimeType: 'application/pdf',
        originalName: 'doc.pdf',
        uploadedBy: '7',
        url: '/uploads/doc.pdf',
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'file-1',
        legacyUrl: '/uploads/doc.pdf',
        url: '/uploads/doc.pdf',
      }),
    );
  });

  it('returns count zero after clearing references when no active attachment resolves', async () => {
    vi.mocked(prisma.file_assets.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const result = await FileStorageService.registerReferencesFromAttachments({
      attachments: [{ fileId: 'missing' }, '/missing.png'],
      bizId: 'biz-1',
      bizType: 'quality_record',
    });

    expect(result).toEqual({ count: 0 });
    expect(prisma.file_references.createMany).not.toHaveBeenCalled();
  });

  it('soft deletes unreferenced files after removing business references', async () => {
    vi.mocked(prisma.file_references.findMany).mockResolvedValue([
      { fileId: 'file-1' },
      { fileId: 'file-1' },
      { fileId: 'file-2' },
    ] as never);

    await FileStorageService.softDeleteReferences({
      bizId: 'biz-1',
      bizType: 'inspection',
    });

    expect(prisma.file_references.deleteMany).toHaveBeenCalledWith({
      where: { bizId: 'biz-1', bizType: 'inspection' },
    });
    expect(prisma.file_assets.updateMany).toHaveBeenCalledWith({
      data: {
        deletedAt: expect.any(Date),
        status: 'DELETED',
      },
      where: {
        id: { in: ['file-1', 'file-2'] },
        references: { none: {} },
      },
    });
  });

  it('lists orphan files with active unreferenced filter', async () => {
    vi.mocked(prisma.file_assets.findMany).mockResolvedValue([
      { id: 'file-1' },
    ] as never);
    vi.mocked(prisma.file_assets.count).mockResolvedValue(1 as never);

    const result = await FileStorageService.listOrphanFiles({
      page: 2,
      pageSize: 10,
    });

    expect(result.total).toBe(1);
    expect(prisma.file_assets.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: { references: { none: {} }, status: 'ACTIVE' },
      }),
    );
  });

  it('scans missing files and marks missing assets when requested', async () => {
    vi.mocked(prisma.file_assets.findMany).mockResolvedValue([
      { id: 'file-1', objectKey: 'exists.pdf', storageProvider: 'LOCAL' },
      { id: 'file-2', objectKey: 'missing.pdf', storageProvider: 'LOCAL' },
    ] as never);
    exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const result = await FileStorageService.scanMissingFiles({
      limit: 999,
      markMissing: true,
    });

    expect(result).toEqual({
      checked: 2,
      marked: 1,
      missingIds: ['file-2'],
    });
    expect(prisma.file_assets.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'asc' },
      take: 500,
      where: { status: 'ACTIVE' },
    });
    expect(prisma.file_assets.updateMany).toHaveBeenCalledWith({
      data: { status: 'MISSING' },
      where: { id: { in: ['file-2'] } },
    });
  });

  it('rejects empty upload payload before opening stream upload', async () => {
    await expect(
      FileStorageService.uploadFile({ data: Buffer.alloc(0) }),
    ).rejects.toThrow('upload file payload is empty');
    expect(uploadStream).not.toHaveBeenCalled();
  });
});
