import { describe } from 'node:test';

import { expect, test } from 'vitest';

import {
  matchesCronExpression,
  parseCronExpression,
} from './cron-expression';

describe('cron-expression', () => {
  test('daily at 08:00 matches exactly', () => {
    const expr = '0 8 * * *';
    expect(matchesCronExpression(expr, new Date(2026, 7, 16, 8, 0))).toBe(true);
    expect(matchesCronExpression(expr, new Date(2026, 7, 16, 8, 1))).toBe(false);
    expect(matchesCronExpression(expr, new Date(2026, 7, 16, 9, 0))).toBe(false);
    expect(matchesCronExpression(expr, new Date(2026, 0, 1, 8, 0))).toBe(true);
  });

  test('wildcard every minute matches any time', () => {
    const expr = '* * * * *';
    expect(matchesCronExpression(expr, new Date(2026, 7, 16, 23, 59))).toBe(true);
    expect(matchesCronExpression(expr, new Date(2026, 2, 5, 0, 0))).toBe(true);
  });

  test('monthly first day at 02:00', () => {
    const expr = '0 2 1 * *';
    expect(matchesCronExpression(expr, new Date(2026, 7, 1, 2, 0))).toBe(true);
    expect(matchesCronExpression(expr, new Date(2026, 7, 2, 2, 0))).toBe(false);
    expect(matchesCronExpression(expr, new Date(2026, 0, 1, 2, 0))).toBe(true);
  });

  test('weekday range 1-5 matches Monday-Friday', () => {
    const expr = '0 9 * * 1-5';
    // 2026-08-17 is a Monday
    expect(matchesCronExpression(expr, new Date(2026, 7, 17, 9, 0))).toBe(true);
    // 2026-08-22 is a Saturday
    expect(matchesCronExpression(expr, new Date(2026, 7, 22, 9, 0))).toBe(false);
  });

  test('list of minutes', () => {
    const expr = '15,45 * * * *';
    expect(matchesCronExpression(expr, new Date(2026, 7, 16, 10, 15))).toBe(true);
    expect(matchesCronExpression(expr, new Date(2026, 7, 16, 10, 45))).toBe(true);
    expect(matchesCronExpression(expr, new Date(2026, 7, 16, 10, 30))).toBe(false);
  });

  test('invalid expression throws', () => {
    expect(() => parseCronExpression('0 8 * *')).toThrow(/5 fields/u);
    expect(() => parseCronExpression('0 99 * * *')).toThrow(/out of range/u);
    expect(() => parseCronExpression('a b c d e')).toThrow(/invalid/u);
  });

  test('sunday is 0', () => {
    const expr = '0 0 * * 0';
    // 2026-08-16 is a Sunday
    expect(matchesCronExpression(expr, new Date(2026, 7, 16, 0, 0))).toBe(true);
    expect(matchesCronExpression(expr, new Date(2026, 7, 17, 0, 0))).toBe(false);
  });
});
