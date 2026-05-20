export function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

export function parseNonEmptyIdList(value: unknown): null | string[] {
  const ids = normalizeIdList(value);
  return ids.length > 0 ? ids : null;
}
