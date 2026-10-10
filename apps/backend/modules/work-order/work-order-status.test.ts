import { describe, expect, it } from 'vitest';

import {
  mapToDisplayStatus,
  mapWorkOrderStatus,
  parseWorkOrderStatus,
  WORK_ORDER_STATUS,
} from './work-order-status';

describe('workOrderStatus Mapping', () => {
  describe('mapWorkOrderStatus', () => {
    it('should map database enum values', () => {
      expect(mapWorkOrderStatus(WORK_ORDER_STATUS.OPEN)).toBe('OPEN');
      expect(mapWorkOrderStatus(WORK_ORDER_STATUS.IN_PROGRESS)).toBe(
        'IN_PROGRESS',
      );
      expect(mapWorkOrderStatus(WORK_ORDER_STATUS.COMPLETED)).toBe('COMPLETED');
    });

    it('should map English status values (case-insensitive)', () => {
      expect(mapWorkOrderStatus('open')).toBe('OPEN');
      expect(mapWorkOrderStatus('OPEN')).toBe('OPEN');
      expect(mapWorkOrderStatus('in_progress')).toBe('IN_PROGRESS');
      expect(mapWorkOrderStatus('IN PROGRESS')).toBe('IN_PROGRESS');
      expect(mapWorkOrderStatus('completed')).toBe('COMPLETED');
      expect(mapWorkOrderStatus('CLOSED')).toBe('COMPLETED');
    });

    it('should map Chinese status values', () => {
      expect(mapWorkOrderStatus('未开始')).toBe('OPEN');
      expect(mapWorkOrderStatus('待处理')).toBe('OPEN');
      expect(mapWorkOrderStatus('进行中')).toBe('IN_PROGRESS');
      expect(mapWorkOrderStatus('已完成')).toBe('COMPLETED');
      expect(mapWorkOrderStatus('已结束')).toBe('COMPLETED');
    });

    it('should map mixed values (case and space insensitive)', () => {
      expect(mapWorkOrderStatus('  Open  ')).toBe('OPEN');
      expect(mapWorkOrderStatus('IN_PROGRESS')).toBe('IN_PROGRESS');
      expect(mapWorkOrderStatus('Completed')).toBe('COMPLETED');
    });

    it('should return OPEN as default for unknown status', () => {
      expect(mapWorkOrderStatus('UNKNOWN')).toBe('OPEN');
      expect(mapWorkOrderStatus('random')).toBe('OPEN');
      expect(mapWorkOrderStatus(null)).toBe('OPEN');
      expect(mapWorkOrderStatus(undefined)).toBe('OPEN');
      expect(mapWorkOrderStatus('')).toBe('OPEN');
    });
  });

  describe('parseWorkOrderStatus', () => {
    it('accepts canonical, localized and case-insensitive values', () => {
      expect(parseWorkOrderStatus('OPEN')).toBe('OPEN');
      expect(parseWorkOrderStatus('in progress')).toBe('IN_PROGRESS');
      expect(parseWorkOrderStatus('已完成')).toBe('COMPLETED');
      expect(parseWorkOrderStatus(' CLOSED ')).toBe('COMPLETED');
    });

    /**
     * Regression: interactive writes previously coerced an unknown status to
     * OPEN and persisted it under HTTP 200. The strict parser must return null
     * so the route can reject with 400 instead of silently defaulting.
     */
    it('returns null for unknown, empty and non-string input', () => {
      expect(parseWorkOrderStatus('NOT_A_STATUS')).toBeNull();
      expect(parseWorkOrderStatus('random')).toBeNull();
      expect(parseWorkOrderStatus('')).toBeNull();
      expect(parseWorkOrderStatus('   ')).toBeNull();
      expect(parseWorkOrderStatus(null)).toBeNull();
      expect(parseWorkOrderStatus(undefined)).toBeNull();
      expect(parseWorkOrderStatus({})).toBeNull();
    });
  });

  describe('mapToDisplayStatus', () => {
    it('should map database enum to Chinese display text', () => {
      expect(mapToDisplayStatus('OPEN')).toBe('未开始');
      expect(mapToDisplayStatus('IN_PROGRESS')).toBe('进行中');
      expect(mapToDisplayStatus('COMPLETED')).toBe('已完成');
    });

    it('should return default for null/undefined', () => {
      expect(mapToDisplayStatus(null)).toBe('未开始');
      expect(mapToDisplayStatus(undefined)).toBe('未开始');
    });

    it('should return original value for unknown status', () => {
      expect(mapToDisplayStatus('UNKNOWN')).toBe('UNKNOWN');
    });
  });
});
