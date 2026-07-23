export function formatWorkOrderRequirementItems(items: unknown[]): string {
  return items
    .map((item) =>
      typeof item === 'string' ? item : String(JSON.stringify(item) ?? ''),
    )
    .join('\n');
}

export function resolveWorkOrderRequirementItems(params: {
  currentText: string;
  originalItems: unknown[];
  originalText: string;
}): unknown[] {
  if (params.currentText === params.originalText) {
    return params.originalItems;
  }

  return params.currentText
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}
