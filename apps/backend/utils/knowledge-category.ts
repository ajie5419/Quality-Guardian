import type { Prisma } from '@prisma/client';

import {
  buildKnowledgeCategoryCreateData as buildKnowledgeCategoryCreateDataRule,
  buildKnowledgeCategoryUpdateData as buildKnowledgeCategoryUpdateDataRule,
} from '@qgs/domain';

export function buildKnowledgeCategoryCreateData(
  input: Record<string, unknown>,
): Prisma.knowledge_categoriesUncheckedCreateInput {
  return buildKnowledgeCategoryCreateDataRule(
    input,
  ) as Prisma.knowledge_categoriesUncheckedCreateInput;
}

export function buildKnowledgeCategoryUpdateData(
  input: Record<string, unknown>,
): Prisma.knowledge_categoriesUncheckedUpdateInput {
  return buildKnowledgeCategoryUpdateDataRule(
    input,
  ) as Prisma.knowledge_categoriesUncheckedUpdateInput;
}
