import type { Prisma } from '@prisma/client';

import {
  buildKnowledgeCategoryCreateData as buildKnowledgeCategoryCreateDataRule,
  buildKnowledgeCategoryUpdateData as buildKnowledgeCategoryUpdateDataRule,
} from '@qgs/shared';
import { buildGovernedWriteFieldsForTable } from '~/governance/master-data/master-data-governance-write';

function buildGovernedKnowledgeCategoryNameFields(
  input: Record<string, unknown>,
) {
  try {
    return buildGovernedWriteFieldsForTable('knowledge_categories', input);
  } catch {
    // Keep runtime behavior stable when global governance mapping is temporarily inconsistent.
    return {};
  }
}

export function buildKnowledgeCategoryCreateData(
  input: Record<string, unknown>,
): Prisma.knowledge_categoriesUncheckedCreateInput {
  const createData = buildKnowledgeCategoryCreateDataRule(
    input,
  ) as Prisma.knowledge_categoriesUncheckedCreateInput;
  return {
    ...createData,
    ...buildGovernedKnowledgeCategoryNameFields(createData),
  };
}

export function buildKnowledgeCategoryUpdateData(
  input: Record<string, unknown>,
): Prisma.knowledge_categoriesUncheckedUpdateInput {
  const updateData = buildKnowledgeCategoryUpdateDataRule(
    input,
  ) as Prisma.knowledge_categoriesUncheckedUpdateInput;
  return {
    ...updateData,
    ...buildGovernedKnowledgeCategoryNameFields(updateData),
  };
}
