type RequirementAttachment = {
  name?: string;
  thumbUrl?: string;
  type?: string;
  url: string;
};

export function parseRequirementAttachments(
  value?: null | string,
): RequirementAttachment[] {
  const raw = String(value || '').trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeRequirementAttachment(item))
      .filter(Boolean);
  } catch {
    return normalizeLegacyAttachment(raw);
  }
}

export function stringifyRequirementAttachments(value: unknown) {
  if (!Array.isArray(value)) return null;
  const normalized = value
    .map((item) => normalizeRequirementAttachment(item))
    .filter(Boolean);
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

function normalizeRequirementAttachment(
  value: unknown,
): null | RequirementAttachment {
  if (!value || typeof value !== 'object') return null;
  const source = value as {
    name?: unknown;
    thumbUrl?: unknown;
    type?: unknown;
    url?: unknown;
  };
  const url = String(source.url || '').trim();
  if (!url) return null;
  return {
    name: String(source.name || '').trim() || inferNameFromUrl(url),
    thumbUrl: String(source.thumbUrl || '').trim() || undefined,
    type: String(source.type || '').trim() || undefined,
    url,
  };
}

function normalizeLegacyAttachment(value: string): RequirementAttachment[] {
  return value ? [{ name: inferNameFromUrl(value), url: value }] : [];
}

function inferNameFromUrl(url: string) {
  const pathname = url.split('?')[0] || url;
  const segments = pathname.split('/');
  return decodeURIComponent(segments.at(-1) || '附件');
}
