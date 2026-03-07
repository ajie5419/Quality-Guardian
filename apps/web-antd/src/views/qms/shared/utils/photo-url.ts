export type QmsPhotoLike =
  | string
  | {
      thumbnailUrl?: unknown;
      thumbUrl?: unknown;
      url?: unknown;
    };

export function buildThumbUrlFromOriginal(url: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed) return '';

  const [pathPart, query = ''] = trimmed.split('?');
  if (!pathPart) return trimmed;

  const dotIndex = pathPart.lastIndexOf('.');
  const suffix = '_thumb.webp';
  const thumbPath =
    dotIndex > 0
      ? `${pathPart.slice(0, dotIndex)}${suffix}`
      : `${pathPart}${suffix}`;
  const apiThumbPath = thumbPath
    .replace(/^\/uploads\//, '/api/uploads/')
    .replace(/^(https?:\/\/[^/]+)\/uploads\//, '$1/api/uploads/');

  return query ? `${apiThumbPath}?${query}` : apiThumbPath;
}

export function extractPhotoUrl(photo: unknown): string | undefined {
  if (typeof photo === 'string') {
    return photo.trim() || undefined;
  }
  if (photo && typeof photo === 'object') {
    const url = (photo as { url?: unknown }).url;
    if (typeof url === 'string') {
      return url.trim() || undefined;
    }
  }
  return undefined;
}

export function extractPhotoThumbUrl(photo: unknown): string | undefined {
  if (photo && typeof photo === 'object') {
    const thumbUrl = (photo as { thumbUrl?: unknown }).thumbUrl;
    if (typeof thumbUrl === 'string' && thumbUrl.trim()) {
      return thumbUrl.trim();
    }

    const thumbnailUrl = (photo as { thumbnailUrl?: unknown }).thumbnailUrl;
    if (typeof thumbnailUrl === 'string' && thumbnailUrl.trim()) {
      return thumbnailUrl.trim();
    }

    const original = extractPhotoUrl(photo);
    if (original) {
      return buildThumbUrlFromOriginal(original);
    }
  }

  if (typeof photo === 'string' && photo.trim()) {
    return buildThumbUrlFromOriginal(photo.trim());
  }

  return undefined;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
