export function parseAttachmentItems(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return [value];
  try {
    const parsed = JSON.parse(String(value));
    if (Array.isArray(parsed)) return parsed;
    return parsed ? [parsed] : [];
  } catch {
    return [value];
  }
}

export function extractStoredName(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withoutQuery = raw.split('?')[0] || '';
  const filename = withoutQuery.split('/').findLast(Boolean) || '';
  return filename.startsWith('oss_') ? filename.slice(4) : filename;
}

export function resolveAttachmentLookup(item: unknown) {
  if (typeof item === 'string') {
    return { storedName: extractStoredName(item) };
  }
  if (!item || typeof item !== 'object') {
    return { storedName: '' };
  }
  const record = item as Record<string, unknown>;
  const fileId = String(record.fileId || '').trim();
  if (fileId) return { fileId };

  return {
    storedName: extractStoredName(
      record.url || record.path || record.filename || record.thumbUrl,
    ),
  };
}
