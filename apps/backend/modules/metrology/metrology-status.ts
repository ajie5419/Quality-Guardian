export {
  calculateRemainingDays,
  deriveMetrologyInspectionStatus,
  getMetrologyBorrowStatusLabel,
  getMetrologyInspectionStatusLabel,
  normalizeMetrologyBorrowStatus,
  startOfToday,
} from '@qgs/shared';

/** Metrology writers store business dates at local midnight, not UTC midnight. */
export function formatMetrologyDate(value: Date | null | string | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
export type {
  MetrologyBorrowStatus,
  MetrologyInspectionStatus,
} from '@qgs/shared';
