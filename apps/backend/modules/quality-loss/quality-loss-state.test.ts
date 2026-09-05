import { describe, expect, it } from 'vitest';

import {
  assertQualityLossTransition,
  isQualityLossStatus,
  parseQualityLossUpdateStatus,
  QUALITY_LOSS_STATES,
  QUALITY_LOSS_TRANSITIONS,
} from './quality-loss-state';

describe('quality-loss state machine', () => {
  it('exposes the unified bucket transition matrix', () => {
    expect(QUALITY_LOSS_STATES).toEqual([
      'Pending',
      'Processing',
      'Confirmed',
      'Resolved',
    ]);
    expect(QUALITY_LOSS_TRANSITIONS).toEqual({
      Confirmed: ['Processing', 'Resolved'],
      Pending: ['Processing', 'Confirmed', 'Resolved'],
      Processing: ['Pending', 'Confirmed', 'Resolved'],
      Resolved: ['Pending'],
    });
  });

  it('parses known statuses strictly and rejects unknown text', () => {
    expect(parseQualityLossUpdateStatus('Confirmed')).toBe('Confirmed');
    expect(parseQualityLossUpdateStatus('CLOSED')).toBe('Confirmed');
    expect(parseQualityLossUpdateStatus('processing')).toBe('Processing');
    expect(parseQualityLossUpdateStatus('bogus')).toBeNull();
    expect(parseQualityLossUpdateStatus('')).toBeNull();
  });

  it('recognizes canonical unified buckets only', () => {
    expect(isQualityLossStatus('Pending')).toBe(true);
    expect(isQualityLossStatus('OPEN')).toBe(false);
  });

  it('allows forward transitions and correction edges', () => {
    expect(() =>
      assertQualityLossTransition('Pending', 'Processing'),
    ).not.toThrow();
    expect(() =>
      assertQualityLossTransition('Processing', 'Confirmed'),
    ).not.toThrow();
    expect(() =>
      assertQualityLossTransition('Confirmed', 'Resolved'),
    ).not.toThrow();
    expect(() =>
      assertQualityLossTransition('Confirmed', 'Processing'),
    ).not.toThrow();
    expect(() =>
      assertQualityLossTransition('Resolved', 'Pending'),
    ).not.toThrow();
  });

  it('rejects illegal jumps with 409 CONFLICT', () => {
    expect(() =>
      assertQualityLossTransition('Confirmed', 'Pending'),
    ).toThrowError(
      expect.objectContaining({ code: 'CONFLICT', httpStatus: 409 }),
    );
    expect(() =>
      assertQualityLossTransition('Resolved', 'Confirmed'),
    ).toThrowError(
      expect.objectContaining({ code: 'CONFLICT', httpStatus: 409 }),
    );
    expect(() =>
      assertQualityLossTransition('Resolved', 'Processing'),
    ).toThrowError(
      expect.objectContaining({ code: 'CONFLICT', httpStatus: 409 }),
    );
  });

  it('fails closed on unknown status with 400', () => {
    expect(() => assertQualityLossTransition('Pending', 'OPEN')).toThrowError(
      expect.objectContaining({ code: 'BAD_REQUEST', httpStatus: 400 }),
    );
    expect(() =>
      assertQualityLossTransition('UNKNOWN', 'Pending'),
    ).toThrowError(
      expect.objectContaining({ code: 'BAD_REQUEST', httpStatus: 400 }),
    );
  });
});
