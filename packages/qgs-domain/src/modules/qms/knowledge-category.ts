export function buildKnowledgeCategoryCreateData(
  input: Record<string, unknown>,
) {
  return {
    name: input.name as string,
    description: input.description as null | string | undefined,
    parentId: (input.parentId || null) as null | string,
  };
}

export function buildKnowledgeCategoryUpdateData(
  input: Record<string, unknown>,
) {
  return {
    name: input.name as string,
    description: input.description as null | string | undefined,
    parentId: input.parentId as null | string | undefined,
  };
}
