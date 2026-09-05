import { describe, expect, it } from 'vitest';

import { normalizeIdempotencyKey } from './idempotency-key';

describe('normalizeIdempotencyKey', () => {
  it('accepts a UUID-style key', () => {
    expect(
      normalizeIdempotencyKey('5f1a9c3e-2d4b-4e6f-8a0b-1c2d3e4f5a6b'),
    ).toBe('5f1a9c3e-2d4b-4e6f-8a0b-1c2d3e4f5a6b');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeIdempotencyKey('  abc-def-123  ')).toBe('abc-def-123');
  });

  it('rejects blank / too-short keys', () => {
    expect(normalizeIdempotencyKey('')).toBeNull();
    expect(normalizeIdempotencyKey('   ')).toBeNull();
    expect(normalizeIdempotencyKey('short')).toBeNull();
  });

  it('rejects keys longer than 128 chars', () => {
    expect(normalizeIdempotencyKey('a'.repeat(129))).toBeNull();
  });

  it('rejects characters outside the allowed charset', () => {
    expect(normalizeIdempotencyKey('abc def')).toBeNull();
    expect(normalizeIdempotencyKey('abc/def')).toBeNull();
    expect(normalizeIdempotencyKey('中文key')).toBeNull();
  });

  it('accepts non-string values as invalid', () => {
    expect(normalizeIdempotencyKey(12_345)).toBeNull();
    expect(normalizeIdempotencyKey(null)).toBeNull();
  });
});
