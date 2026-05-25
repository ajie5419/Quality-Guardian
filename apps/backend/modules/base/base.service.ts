/**
 * BaseService - 提供通用的服务层工具函数
 * 用于减少代码重复，提高可维护性
 */

import type { Prisma } from '@prisma/client';
import type { PageResult } from '@qgs/shared';

import { formatDate, safeNumber } from '@qgs/shared';

// ============ 类型定义 ============

export interface PaginationParams {
  page?: number | string;
  pageSize?: number | string;
}

export interface SortParams {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc' | string;
}

// ============ 分页工具 ============

/**
 * 解析分页参数
 */
export function parsePagination(params: PaginationParams = {}): {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
} {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip, take: pageSize };
}

/**
 * 对数组应用分页
 */
export function applyPagination<T>(
  items: T[],
  params: PaginationParams,
): PageResult<T> {
  const { skip, take } = parsePagination(params);
  return {
    items: items.slice(skip, skip + take),
    total: items.length,
  };
}

// ============ 排序工具 ============

export type SortDirection = 'asc' | 'desc';

/**
 * 解析排序参数
 */
export function parseSortOrder(
  sortBy?: string,
  sortOrder?: string,
  allowedFields: string[] = [],
): null | { direction: SortDirection; field: string } {
  if (!sortBy) return null;

  // 安全检查：只允许预定义的字段
  if (allowedFields.length > 0 && !allowedFields.includes(sortBy)) {
    return null;
  }

  const direction: SortDirection = sortOrder === 'desc' ? 'desc' : 'asc';
  return { field: sortBy, direction };
}

/**
 * 构建 Prisma orderBy 对象
 */
export function buildOrderBy(
  sortBy?: string,
  sortOrder?: string,
  allowedFields: string[] = [],
): Record<string, SortDirection> | undefined {
  const sort = parseSortOrder(sortBy, sortOrder, allowedFields);
  if (!sort) return undefined;
  return { [sort.field]: sort.direction };
}

// ============ 查询条件构建器 ============

/**
 * 构建软删除过滤条件
 */
export function withSoftDelete<T extends Record<string, any>>(
  where: T,
  includeDeleted = false,
): T & { isDeleted?: boolean } {
  const result: T & { isDeleted?: boolean } = { ...where };
  if (!includeDeleted) {
    result.isDeleted = false;
  }
  return result;
}

/**
 * 构建包含搜索条件（contains 模式）
 */
export function buildContainsFilter(
  value?: string,
): Prisma.StringFilter | undefined {
  if (!value || value.trim() === '') return undefined;
  return { contains: value.trim() };
}

/**
 * 构建精确匹配条件
 */
export function buildExactFilter<T>(value?: T): T | undefined {
  return value ?? undefined;
}

/**
 * 构建日期范围条件
 */
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

/**
 * 构建年份过滤条件
 */
export function buildYearFilter(
  year?: null | number | string,
): Prisma.DateTimeFilter | undefined {
  const y = Number(year);
  if (!y || Number.isNaN(y)) return undefined;
  return {
    gte: new Date(`${y}-01-01`),
    lt: new Date(`${y + 1}-01-01`),
  };
}

// ============ 响应格式化工具 ============

/**
 * 格式化日期为 ISO 字符串（仅日期部分）
 */
export function formatDateString(
  date: Date | null | string | undefined,
): null | string {
  const formatted = formatDate(date);
  return formatted || null;
}

/**
 * 格式化数字（保留2位小数）
 */
export function formatNumber(
  value: null | number | string | undefined,
  decimals = 2,
): number {
  const num = safeNumber(value);
  return Number(num.toFixed(decimals));
}

export { safeNumber };

/**
 * 构建分页响应
 */
export function formatPaginatedResponse<T, R>(
  items: T[],
  params: PaginationParams,
  transformer: (item: T) => R,
): PageResult<R> {
  const { skip, take } = parsePagination(params);
  const paginatedItems = items.slice(skip, skip + take);

  return {
    items: paginatedItems.map((item) => transformer(item)),
    total: items.length,
  };
}

// ============ 通用 Where 条件构建器 ============

export type BuilderFn<V> = (value: V) => any;

export type WhereClauseBuilder<T> = {
  [K in keyof T]?: BuilderFn<NonNullable<T[K]>>;
};

/**
 * 通用 where 条件构建器
 * 根据参数和构建器函数自动构建 where 对象
 */
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

// ============ 批量操作工具 ============

/**
 * 软删除多条记录
 */
export async function softDeleteMany(
  model: {
    updateMany: (args: {
      data: { isDeleted: boolean };
      where: { id: { in: string[] } };
    }) => Promise<{ count: number }>;
  },
  ids: string[],
): Promise<{ count: number }> {
  if (ids.length === 0) return { count: 0 };
  return model.updateMany({
    where: { id: { in: ids } },
    data: { isDeleted: true },
  });
}

// ============ 导出 BaseService 对象（可选，用于命名空间式调用）============

export const BaseService = {
  parsePagination,
  applyPagination,
  parseSortOrder,
  buildOrderBy,
  withSoftDelete,
  buildContainsFilter,
  buildExactFilter,
  buildDateRangeFilter,
  buildYearFilter,
  formatDateString,
  formatNumber,
  safeNumber,
  formatPaginatedResponse,
  buildWhereClause,
  softDeleteMany,
};
