import type { Prisma } from '@prisma/client';

import {
  buildKnowledgeCreateDataCore,
  buildKnowledgeUpdateDataCore,
} from '@qgs/shared';

type KnowledgeAuthorContext = {
  realName?: string;
  username?: string;
};

export function buildKnowledgeCreateData(
  body: Record<string, unknown>,
  targetCategoryId: string,
  author: KnowledgeAuthorContext,
): Prisma.knowledge_baseUncheckedCreateInput {
  return buildKnowledgeCreateDataCore(
    body,
    targetCategoryId,
    author,
  ) as Prisma.knowledge_baseUncheckedCreateInput;
}

export function buildKnowledgeUpdateData(
  body: Record<string, unknown>,
): Prisma.knowledge_baseUncheckedUpdateInput {
  return buildKnowledgeUpdateDataCore(
    body,
  ) as Prisma.knowledge_baseUncheckedUpdateInput;
}
