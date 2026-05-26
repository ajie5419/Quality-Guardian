import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { buildGovernedWriteFieldsForTable } from '~/utils/master-data-governance-write';
import prisma from '~/utils/prisma';

import {
  buildKnowledgeCreateData,
  buildKnowledgeUpdateData,
} from './knowledge';
import {
  buildKnowledgeCategoryCreateData,
  buildKnowledgeCategoryUpdateData,
} from './knowledge-category';

function formatKnowledgeItem(item: any) {
  return {
    ...item,
    categoryName: item.category?.name || '未分类',
    publishDate: item.publishDate
      ? item.publishDate.toISOString().split('T')[0]
      : item.createdAt.toISOString().split('T')[0],
    tags: item.tags ? item.tags.split(',') : [],
    attachments: item.attachment ? JSON.parse(item.attachment) : [],
    updatedAt: item.updatedAt.toLocaleString(),
  };
}

export const KnowledgeRouteService = {
  async create(
    body: Record<string, unknown>,
    userinfo: { realName?: string; username?: string },
  ) {
    let targetCategoryId = String(body.categoryId || '').trim();
    if (!targetCategoryId) {
      const defaultCat = await prisma.knowledge_categories.findFirst({
        where: { id: 'CAT-DEFAULT' },
      });
      if (!defaultCat) {
        const seed = { id: 'CAT-DEFAULT', name: '通用知识', sort: 0 };
        await prisma.knowledge_categories.create({
          data: {
            ...buildKnowledgeCategoryCreateData(seed),
            ...buildGovernedWriteFieldsForTable('knowledge_categories', seed),
          },
        });
      }
      targetCategoryId = 'CAT-DEFAULT';
    }
    const created = await prisma.knowledge_base.create({
      data: buildKnowledgeCreateData(body, targetCategoryId, {
        realName: userinfo.realName,
        username: userinfo.username,
      }),
    });
    await FileStorageService.registerReferencesFromAttachments({
      attachments: body.attachments,
      bizId: created.id,
      bizType: 'knowledge_base',
    });
    return created;
  },

  async deleteById(id: string) {
    await prisma.knowledge_base.update({
      where: { id },
      data: { isDeleted: true },
    });
    await FileStorageService.softDeleteReferences({
      bizId: id,
      bizType: 'knowledge_base',
    });
  },

  async getById(id: string) {
    const item = await prisma.knowledge_base.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!item) return null;
    return formatKnowledgeItem(item);
  },

  async getCategoryTree() {
    let categories = await prisma.knowledge_categories.findMany({
      where: { isDeleted: false },
      orderBy: { sort: 'asc' },
    });
    if (categories.length === 0) {
      const seed = {
        id: 'CAT-DEFAULT',
        name: '通用知识',
        description: '系统自动创建的默认知识分类',
        sort: 0,
      };
      const created = await prisma.knowledge_categories.create({
        data: {
          ...buildKnowledgeCategoryCreateData(seed),
          ...buildGovernedWriteFieldsForTable('knowledge_categories', seed),
        },
      });
      categories = [created];
    }
    const buildTree = (parentId: null | string = null): any[] =>
      categories
        .filter((cat) => cat.parentId === parentId)
        .map((cat) => ({ ...cat, children: buildTree(cat.id) }));
    return buildTree(null);
  },

  async getList(query: {
    categoryId?: unknown;
    keyword?: unknown;
    page?: unknown;
    pageSize?: unknown;
  }) {
    const page = Number(query.page || 1);
    const pageSize = Number(query.pageSize || 10);
    const where = {
      isDeleted: false,
      ...(query.categoryId ? { categoryId: String(query.categoryId) } : {}),
      ...(query.keyword
        ? {
            OR: [
              { title: { contains: String(query.keyword) } },
              { summary: { contains: String(query.keyword) } },
            ],
          }
        : {}),
    };
    const [list, total] = await Promise.all([
      prisma.knowledge_base.findMany({
        where,
        include: { category: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.knowledge_base.count({ where }),
    ]);
    return { items: list.map((item) => formatKnowledgeItem(item)), total };
  },

  async updateById(id: string, body: Record<string, unknown>) {
    await prisma.knowledge_base.update({
      where: { id },
      data: buildKnowledgeUpdateData(body),
    });
    if (body.attachments !== undefined) {
      await FileStorageService.registerReferencesFromAttachments({
        attachments: body.attachments,
        bizId: id,
        bizType: 'knowledge_base',
      });
    }
  },

  async upsertCategory(body: Record<string, unknown>) {
    return prisma.knowledge_categories.create({
      data: buildKnowledgeCategoryCreateData(body),
    });
  },

  async updateCategoryById(id: string, body: Record<string, unknown>) {
    await prisma.knowledge_categories.update({
      where: { id },
      data: buildKnowledgeCategoryUpdateData(body),
    });
  },

  async deleteCategoryById(id: string) {
    await prisma.knowledge_categories.update({
      where: { id },
      data: { isDeleted: true },
    });
  },
};
