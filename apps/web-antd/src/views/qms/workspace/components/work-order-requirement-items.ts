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

  const originalItemsByText = new Map<string, unknown[]>();
  for (const item of params.originalItems) {
    const text = formatWorkOrderRequirementItems([item]).trim();
    if (!text) continue;
    const matchingItems = originalItemsByText.get(text) ?? [];
    matchingItems.push(item);
    originalItemsByText.set(text, matchingItems);
  }

  const parseEditedItem = (text: string): unknown => {
    const originalItem = originalItemsByText.get(text)?.shift();
    if (originalItem !== undefined) return originalItem;

    if (
      (text.startsWith('{') && text.endsWith('}')) ||
      (text.startsWith('[') && text.endsWith(']'))
    ) {
      try {
        return JSON.parse(text);
      } catch {
        // Keep invalid JSON as user-entered text.
      }
    }
    return text;
  };

  return params.currentText
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => parseEditedItem(item));
}
