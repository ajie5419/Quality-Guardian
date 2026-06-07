import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { KnowledgeRouteService } from '~/modules/knowledge/knowledge-route.service';
import prisma from '~/utils/prisma';

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    registerReferencesFromAttachments: vi.fn(),
    softDeleteReferences: vi.fn(),
  },
}));

vi.mock('~/utils/governed-write', () => ({
  buildGovernedWriteFieldsForTable: vi.fn((_table, input) => ({
    governedName: input.name,
  })),
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    knowledge_base: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    knowledge_categories: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

function createKnowledge(overrides: Record<string, unknown> = {}) {
  return {
    attachment: JSON.stringify([{ name: 'a.txt' }]),
    category: { name: 'Quality' },
    categoryId: 'CAT-1',
    createdAt: new Date('2026-06-01T08:00:00Z'),
    id: 'KB-1',
    publishDate: new Date('2026-06-02T08:00:00Z'),
    tags: 'a,b',
    title: 'Knowledge',
    updatedAt: new Date('2026-06-03T08:00:00Z'),
    ...overrides,
  };
}

describe('knowledgeRouteService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates default category when create body does not provide category id', async () => {
    (prisma.knowledge_categories.findFirst as any).mockResolvedValueOnce(null);
    (prisma.knowledge_categories.create as any).mockResolvedValueOnce({
      id: 'CAT-DEFAULT',
    });
    (prisma.knowledge_base.create as any).mockResolvedValueOnce({
      id: 'KB-1',
      title: 'Knowledge',
    });
    const attachments = [{ fileId: 'file-1' }];

    const result = await KnowledgeRouteService.create(
      {
        attachments,
        content: 'content',
        title: 'Knowledge',
      },
      { realName: 'Tom', username: 'tom' },
    );

    expect(result).toEqual({ id: 'KB-1', title: 'Knowledge' });
    expect(prisma.knowledge_categories.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: '通用知识',
      }),
    });
    expect(prisma.knowledge_base.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        author: 'Tom',
        categoryId: 'CAT-DEFAULT',
        title: 'Knowledge',
      }),
    });
    expect(
      FileStorageService.registerReferencesFromAttachments,
    ).toHaveBeenCalledWith({
      attachments,
      bizId: 'KB-1',
      bizType: 'knowledge_base',
    });
  });

  it('uses provided category id and skips default category seeding', async () => {
    (prisma.knowledge_base.create as any).mockResolvedValueOnce({ id: 'KB-2' });

    await KnowledgeRouteService.create(
      {
        categoryId: ' CAT-2 ',
        title: 'Knowledge',
      },
      { username: 'tom' },
    );

    expect(prisma.knowledge_categories.findFirst).not.toHaveBeenCalled();
    expect(prisma.knowledge_base.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        author: 'tom',
        categoryId: 'CAT-2',
      }),
    });
  });

  it('formats detail and list items consistently', async () => {
    (prisma.knowledge_base.findUnique as any).mockResolvedValueOnce(
      createKnowledge(),
    );

    await expect(KnowledgeRouteService.getById('KB-1')).resolves.toMatchObject({
      attachments: [{ name: 'a.txt' }],
      categoryName: 'Quality',
      publishDate: '2026-06-02',
      tags: ['a', 'b'],
      updatedAt: expect.any(String),
    });

    (prisma.knowledge_base.findUnique as any).mockResolvedValueOnce(null);
    await expect(KnowledgeRouteService.getById('missing')).resolves.toBeNull();

    (prisma.knowledge_base.findMany as any).mockResolvedValueOnce([
      createKnowledge({
        attachment: '',
        category: null,
        publishDate: null,
        tags: '',
      }),
    ]);
    (prisma.knowledge_base.count as any).mockResolvedValueOnce(1);

    const list = await KnowledgeRouteService.getList({
      categoryId: 'CAT-1',
      keyword: 'quality',
      page: 2,
      pageSize: 5,
    });

    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({
      attachments: [],
      categoryName: '未分类',
      publishDate: '2026-06-01',
      tags: [],
    });
    expect(prisma.knowledge_base.findMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        categoryId: 'CAT-1',
        OR: [
          { title: { contains: 'quality' } },
          { summary: { contains: 'quality' } },
        ],
      },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
      skip: 5,
      take: 5,
    });
  });

  it('builds category tree and seeds default category when empty', async () => {
    (prisma.knowledge_categories.findMany as any).mockResolvedValueOnce([
      { id: 'CAT-1', name: 'Root', parentId: null },
      { id: 'CAT-2', name: 'Child', parentId: 'CAT-1' },
    ]);

    await expect(KnowledgeRouteService.getCategoryTree()).resolves.toEqual([
      {
        children: [
          { children: [], id: 'CAT-2', name: 'Child', parentId: 'CAT-1' },
        ],
        id: 'CAT-1',
        name: 'Root',
        parentId: null,
      },
    ]);

    (prisma.knowledge_categories.findMany as any).mockResolvedValueOnce([]);
    (prisma.knowledge_categories.create as any).mockResolvedValueOnce({
      id: 'CAT-DEFAULT',
      name: '通用知识',
      parentId: null,
    });

    await expect(KnowledgeRouteService.getCategoryTree()).resolves.toEqual([
      {
        children: [],
        id: 'CAT-DEFAULT',
        name: '通用知识',
        parentId: null,
      },
    ]);
  });

  it('updates and deletes knowledge records with file references', async () => {
    await KnowledgeRouteService.updateById('KB-1', {
      attachments: [{ fileId: 'file-1' }],
      title: 'Updated',
    });

    expect(prisma.knowledge_base.update).toHaveBeenCalledWith({
      where: { id: 'KB-1' },
      data: expect.objectContaining({ title: 'Updated' }),
    });
    expect(
      FileStorageService.registerReferencesFromAttachments,
    ).toHaveBeenCalledWith({
      attachments: [{ fileId: 'file-1' }],
      bizId: 'KB-1',
      bizType: 'knowledge_base',
    });

    await KnowledgeRouteService.updateById('KB-1', { title: 'No attachments' });
    expect(
      FileStorageService.registerReferencesFromAttachments,
    ).toHaveBeenCalledTimes(1);

    await KnowledgeRouteService.deleteById('KB-1');

    expect(prisma.knowledge_base.update).toHaveBeenLastCalledWith({
      where: { id: 'KB-1' },
      data: { isDeleted: true },
    });
    expect(FileStorageService.softDeleteReferences).toHaveBeenCalledWith({
      bizId: 'KB-1',
      bizType: 'knowledge_base',
    });
  });

  it('creates, updates, and deletes categories', async () => {
    (prisma.knowledge_categories.create as any).mockResolvedValueOnce({
      id: 'CAT-1',
    });

    await expect(
      KnowledgeRouteService.upsertCategory({ name: 'Category A' }),
    ).resolves.toEqual({ id: 'CAT-1' });
    expect(prisma.knowledge_categories.update).not.toHaveBeenCalled();

    await KnowledgeRouteService.updateCategoryById('CAT-1', {
      name: 'Category B',
      parentId: null,
    });
    await KnowledgeRouteService.deleteCategoryById('CAT-1');

    expect(prisma.knowledge_categories.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'CAT-1' },
      data: expect.objectContaining({ name: 'Category B', parentId: null }),
    });
    expect(prisma.knowledge_categories.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'CAT-1' },
      data: { isDeleted: true },
    });
  });
});
