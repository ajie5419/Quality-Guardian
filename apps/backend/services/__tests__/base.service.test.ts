import { describe, expect, it } from 'vitest';

import * as BaseService from '../base.service';

describe('baseService', () => {
  describe('parsePagination', () => {
    it('should parse standard pagination', () => {
      const result = BaseService.parsePagination({ page: 2, pageSize: 15 });
      expect(result).toEqual({ page: 2, pageSize: 15, skip: 15, take: 15 });
    });

    it('should handle missing params with defaults', () => {
      const result = BaseService.parsePagination({});
      expect(result).toEqual({ page: 1, pageSize: 20, skip: 0, take: 20 });
    });

    it('should clamp values', () => {
      const result = BaseService.parsePagination({ page: -1, pageSize: 1000 });
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(100);
    });
  });

  describe('buildOrderBy', () => {
    it('should build order by object', () => {
      const result = BaseService.buildOrderBy('name', 'desc', ['name', 'age']);
      expect(result).toEqual({ name: 'desc' });
    });

    it('should return undefined for disallowed fields', () => {
      const result = BaseService.buildOrderBy('unknown', 'asc', ['name']);
      expect(result).toBeUndefined();
    });

    it('should return undefined for missing sortBy', () => {
      const result = BaseService.buildOrderBy(undefined, 'asc');
      expect(result).toBeUndefined();
    });
  });

  describe('withSoftDelete', () => {
    it('should add isDeleted false by default', () => {
      const result = BaseService.withSoftDelete({ id: '1' });
      expect(result).toEqual({ id: '1', isDeleted: false });
    });

    it('should allow including deleted', () => {
      const result = BaseService.withSoftDelete({ id: '1' }, true);
      expect(result.isDeleted).toBeUndefined();
      expect(result.id).toBe('1');
    });
  });

  describe('buildDateRangeFilter', () => {
    it('should build gte and lte', () => {
      const start = '2024-01-01';
      const end = '2024-01-02';
      const result = BaseService.buildDateRangeFilter(start, end);
      expect(result?.gte).toBeInstanceOf(Date);
      expect(result?.lte).toBeInstanceOf(Date);
      expect((result?.gte as Date).toISOString()).toContain('2024-01-01');
    });

    it('should return undefined for no dates', () => {
      expect(BaseService.buildDateRangeFilter()).toBeUndefined();
    });
  });

  describe('formatDateString', () => {
    it('should format date to YYYY-MM-DD', () => {
      const date = new Date('2024-05-20T10:00:00Z');
      expect(BaseService.formatDateString(date)).toBe('2024-05-20');
    });

    it('should return null for null input', () => {
      expect(BaseService.formatDateString(null)).toBeNull();
    });
  });

  describe('formatNumber', () => {
    it('should format number to fixed decimals', () => {
      expect(BaseService.formatNumber(123.456)).toBe(123.46);
      expect(BaseService.formatNumber(123.456, 1)).toBe(123.5);
    });

    it('should handle null/undefined', () => {
      expect(BaseService.formatNumber(null)).toBe(0);
      expect(BaseService.formatNumber(undefined)).toBe(0);
    });
  });

  describe('buildWhereClause', () => {
    it('should build simple where clause', () => {
      const params = { name: 'test', age: 20, empty: '' };
      const builders = {
        name: (v: string) => ({ name: { contains: v } }),
        age: (v: number) => v,
      };
      const result = BaseService.buildWhereClause(params, builders as any);
      expect(result).toEqual({
        name: { contains: 'test' },
        age: 20,
      });
    });

    it('should append to base where', () => {
      const params = { type: 'A' };
      const builders = { type: (v: string) => v };
      const base = { isDeleted: false };
      const result = BaseService.buildWhereClause(
        params,
        builders as any,
        base,
      );
      expect(result).toEqual({ isDeleted: false, type: 'A' });
    });
  });
});
