import { expect, it } from 'vitest';

import { formatMetrologyDate } from './metrology-status';

it('round-trips a local business date without shifting it into the previous UTC day', () => {
  expect(formatMetrologyDate(new Date(2099, 11, 31))).toBe('2099-12-31');
  expect(formatMetrologyDate(new Date(2026, 0, 1))).toBe('2026-01-01');
});

it('returns no date for absent or invalid values', () => {
  expect(formatMetrologyDate(null)).toBeNull();
  expect(formatMetrologyDate('invalid')).toBeNull();
});
