import { ErrorCode } from '@qgs/shared';

/**
 * Bounded-read contract (PERF-QMS-001 / PHASE-1A):
 * - Interactive list APIs cap page size at INTERACTIVE_PAGE_SIZE_MAX and
 *   always paginate in the database (skip + take).
 * - Export queries read at most EXPORT_QUERY_TAKE = EXPORT_ROWS_MAX + 1 rows;
 *   the extra row proves the limit is exceeded so the caller fails fast
 *   instead of loading the whole table into memory.
 * - Interactive lists and exports are intentionally different bounded
 *   entries: exports never go through parsePagination (which caps at 100).
 */
export const INTERACTIVE_PAGE_SIZE_MAX = 100;
export const EXPORT_ROWS_MAX = 20_000;
export const EXPORT_QUERY_TAKE = EXPORT_ROWS_MAX + 1;

export function isExportLimitExceeded(
  rows: readonly unknown[] | undefined,
): boolean {
  return (rows?.length ?? 0) > EXPORT_ROWS_MAX;
}

export const EXPORT_LIMIT_EXCEEDED_MESSAGE = `导出数据量超过上限（${EXPORT_ROWS_MAX} 条），请缩小筛选范围后重试`;

/** Error payload attached to the EXPORT_LIMIT_EXCEEDED response. */
export function exportLimitExceededError() {
  return { code: ErrorCode.EXPORT_LIMIT_EXCEEDED, maxRows: EXPORT_ROWS_MAX };
}
