import type { Prisma } from '@prisma/client';
import type { PageResult } from '@qgs/shared';

import { formatDate, safeNumber } from '@qgs/shared';

export interface PaginationParams {
  page?: number | string;
  pageSize?: number | string;
}

export type SortDirection = 'asc' | 'desc';

export function parseSortOrder(
  sortBy?: string,
  sortOrder?: string,
  allowedFields: string[] = [],
): null | { direction: SortDirection; field: string } {
  if (!sortBy) return null;
  if (allowedFields.length > 0 && !allowedFields.includes(sortBy)) return null;
  const direction: SortDirection = sortOrder === 'desc' ? 'desc' : 'asc';
  return { field: sortBy, direction };
}

export function buildOrderBy(
  sortBy?: string,
  sortOrder?: string,
  allowedFields: string[] = [],
): Record<string, SortDirection> | undefined {
  const sort = parseSortOrder(sortBy, sortOrder, allowedFields);
  if (!sort) return undefined;
  return { [sort.field]: sort.direction };
}

export function parsePagination(params: PaginationParams = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip, take: pageSize };
}

export function applyPagination<T>(items: T[], params: PaginationParams): PageResult<T> {
  const { skip, take } = parsePagination(params);
  return { items: items.slice(skip, skip + take), total: items.length };
}

export function buildDateRangeFilter(
  startDate?: Date | null | string,
  endDate?: Date | null | string,
): Prisma.DateTimeFilter | undefined {
  if (!startDate && !endDate) return undefined;
  const filter: Prisma.DateTimeFilter = {};
  if (startDate) filter.gte = new Date(startDate);
  if (endDate) filter.lte = new Date(endDate);
  return filter;
}

export function withSoftDelete<T extends Record<string, any>>(
  where: T,
  includeDeleted = false,
): T & { isDeleted?: boolean } {
  const result: T & { isDeleted?: boolean } = { ...where };
  if (!includeDeleted) result.isDeleted = false;
  return result;
}

export type BuilderFn<V> = (value: V) => any;
export type WhereClauseBuilder<T> = {
  [K in keyof T]?: BuilderFn<NonNullable<T[K]>>;
};

export function buildWhereClause<T extends Record<string, any>>(
  params: T,
  builders: WhereClauseBuilder<T>,
  baseWhere: Record<string, any> = {},
): Record<string, any> {
  const where = { ...baseWhere };
  for (const [key, value] of Object.entries(params)) {
    const builder = builders[key as keyof T];
    if (value !== undefined && value !== null && value !== '' && builder) {
      const result = builder(value as NonNullable<T[keyof T]>);
      if (result !== undefined) {
        if (
          typeof result === 'object' &&
          result !== null &&
          !Array.isArray(result) &&
          !(result instanceof Date)
        ) {
          Object.assign(where, result);
        } else {
          where[key] = result;
        }
      }
    }
  }
  return where;
}

export function buildYearFilter(year?: null | number | string): Prisma.DateTimeFilter | undefined {
  const y = Number(year);
  if (!y || Number.isNaN(y)) return undefined;
  return {
    gte: new Date(`${y}-01-01`),
    lt: new Date(`${y + 1}-01-01`),
  };
}

export function formatDateString(date: Date | null | string | undefined): null | string {
  const formatted = formatDate(date);
  return formatted || null;
}

export function formatNumber(value: null | number | string | undefined, decimals = 2): number {
  const num = safeNumber(value);
  return Number(num.toFixed(decimals));
}

export { safeNumber };
