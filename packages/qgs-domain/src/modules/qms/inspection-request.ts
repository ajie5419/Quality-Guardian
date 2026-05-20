export const INSPECTION_REQUEST_STATUS = {
  CANCELLED: 'CANCELLED',
  CLOSED: 'CLOSED',
  DISPATCHED: 'DISPATCHED',
  INSPECTING: 'INSPECTING',
  SUBMITTED: 'SUBMITTED',
} as const;

const CHECK_RESULT_SET = new Set(['FAIL', 'NA', 'PASS']);
const REQUEST_STATUS_SET = new Set<string>(
  Object.values(INSPECTION_REQUEST_STATUS),
);

export function normalizeInspectionRequestText(value: unknown): string {
  return String(value ?? '').trim();
}

export function normalizeInspectionRequestCheckResult(
  value: unknown,
  fallback = 'PASS',
) {
  const normalized = normalizeInspectionRequestText(value).toUpperCase();
  return CHECK_RESULT_SET.has(normalized) ? normalized : fallback;
}

export function normalizeInspectionRequestStatus(value: unknown) {
  const normalized = normalizeInspectionRequestText(value).toUpperCase();
  return REQUEST_STATUS_SET.has(normalized) ? normalized : '';
}

export function isInspectionRequestAssemblyProcess(value: unknown) {
  return normalizeInspectionRequestText(value).includes('组装');
}

export function parseInspectionRequestPriority(value: unknown, fallback = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), 5);
}

export function parseInspectionRequestQuantity(value: unknown, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.trunc(parsed));
}

export type InspectionRequestAttachment = {
  fileId?: string;
  name: string;
  size: number;
  type: string;
  url: string;
};

export function normalizeInspectionRequestAttachments(
  value: unknown,
): InspectionRequestAttachment[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const source = item as Record<string, unknown>;
      const url = normalizeInspectionRequestText(source.url);
      if (!url) return null;

      const fileId = normalizeInspectionRequestText(source.fileId) || undefined;
      const name =
        normalizeInspectionRequestText(source.name) ||
        normalizeInspectionRequestText(source.originalName) ||
        '报检单';
      const attachment: InspectionRequestAttachment = {
        name,
        size: Number(source.size || 0),
        type: normalizeInspectionRequestText(source.type),
        url,
      };
      if (fileId) {
        attachment.fileId = fileId;
      }

      return attachment;
    })
    .filter((item): item is InspectionRequestAttachment => item !== null);
}

export function parseInspectionRequestAttachments(
  value: unknown,
): InspectionRequestAttachment[] {
  if (!value) return [];
  if (Array.isArray(value)) return normalizeInspectionRequestAttachments(value);
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed)
      ? normalizeInspectionRequestAttachments(parsed)
      : [];
  } catch {
    return [];
  }
}

export function mergeInspectionRequestAttachments(
  ...sources: unknown[]
): InspectionRequestAttachment[] {
  const merged: InspectionRequestAttachment[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    for (const item of parseInspectionRequestAttachments(source)) {
      const key = normalizeInspectionRequestText(item.fileId) || item.url;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }

  return normalizeInspectionRequestAttachments(merged);
}
