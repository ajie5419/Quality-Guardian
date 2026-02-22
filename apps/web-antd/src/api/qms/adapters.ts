import type { QmsListResponse, QmsMutationResponse } from './types';

export function normalizeListResponse<T>(raw: unknown): QmsListResponse<T> {
  if (Array.isArray(raw)) {
    return { items: raw as T[], total: raw.length };
  }

  const payload = (raw || {}) as Record<string, unknown>;
  const items = Array.isArray(payload.items) ? (payload.items as T[]) : [];
  const totalRaw = payload.total;
  const total =
    typeof totalRaw === 'number'
      ? totalRaw
      : Number(totalRaw ?? Math.max(items.length, 0));

  return { items, total };
}

export function normalizeMutationResponse<T>(
  raw: unknown,
): QmsMutationResponse<T> {
  if (raw && typeof raw === 'object' && 'success' in (raw as object)) {
    const data = raw as QmsMutationResponse<T>;
    return {
      data: data.data,
      message: data.message,
      success: Boolean(data.success),
    };
  }

  return { data: raw as T, success: true };
}
