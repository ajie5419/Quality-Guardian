import type { Prisma } from '@prisma/client';

import { nanoid } from 'nanoid';

type KnowledgeAuthorContext = {
  realName?: string;
  username?: string;
};

function joinKnowledgeTags(tags: unknown): string {
  if (Array.isArray(tags)) {
    return tags.join(',');
  }
  return String(tags || '');
}

function stringifyKnowledgeAttachments(attachments: unknown): string {
  if (typeof attachments === 'string') {
    return attachments;
  }
  return JSON.stringify(attachments || []);
}

export function buildKnowledgeCreateData(
  body: Record<string, unknown>,
  targetCategoryId: string,
  author: KnowledgeAuthorContext,
): Prisma.knowledge_baseUncheckedCreateInput {
  return {
    attachment: stringifyKnowledgeAttachments(body.attachments),
    author: String(author.realName || author.username || 'System'),
    categoryId: targetCategoryId,
    content: String(body.content || ''),
    docId: `KB-${nanoid(6).toUpperCase()}`,
    publishDate: new Date(),
    status: String(body.status || 'Published'),
    summary: String(body.summary || ''),
    tags: joinKnowledgeTags(body.tags),
    title: String(body.title || '未命名案例'),
    version: String(body.version || 'V1.0'),
  };
}

export function buildKnowledgeUpdateData(
  body: Record<string, unknown>,
): Prisma.knowledge_baseUncheckedUpdateInput {
  return {
    attachment: body.attachments ? JSON.stringify(body.attachments) : undefined,
    categoryId: body.categoryId as null | string | undefined,
    content: body.content as null | string | undefined,
    status: body.status as null | string | undefined,
    summary: body.summary as null | string | undefined,
    tags: Array.isArray(body.tags)
      ? body.tags.join(',')
      : (body.tags as null | string | undefined),
    title: body.title as null | string | undefined,
    updatedAt: new Date(),
    version: body.version as null | string | undefined,
  };
}
