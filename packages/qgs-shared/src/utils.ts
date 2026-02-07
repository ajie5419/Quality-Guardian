/**
 * Shared utility functions for both frontend and backend
 */

/**
 * Safely parse JSON string for photos/attachments
 */
export function tryParsePhotos(photos: null | string | undefined): string[] {
  if (!photos) return [];
  try {
    const parsed = JSON.parse(photos);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Format date to YYYY-MM-DD
 */
export function formatDate(
  date: Date | null | number | string | undefined,
): string {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Safely convert value to number
 */
export function safeNumber(value: unknown, defaultValue = 0): number {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'bigint') return Number(value);
  const num = Number(value);
  return Number.isNaN(num) ? defaultValue : num;
}
